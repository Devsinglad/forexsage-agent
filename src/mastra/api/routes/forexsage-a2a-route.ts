import { registerApiRoute } from "@mastra/core/server";
import { randomUUID } from "crypto";

/**
 * A2A Agent Route Handler
 * 
 * This route implements the A2A (Agent-to-Agent) protocol with support for:
 * - Synchronous (blocking) responses
 * - Asynchronous (non-blocking) responses with webhook notifications
 * 
 * The async webhook pattern prevents timeouts for long-running agent tasks.
 */
export const a2aAgentRoute = registerApiRoute("/a2a/agent/:agentId", {
  method: "POST",
  handler: async (c) => {
    try {
      const mastra = c.get("mastra");
      const agentId = c.req.param("agentId");

      // Parse JSON-RPC 2.0 request body
      const body = await c.req.json();
      const { jsonrpc, id: requestId, method, params } = body;

      // Validate JSON-RPC 2.0 format requirements
      if (jsonrpc !== "2.0" || !requestId) {
        return c.json(
          {
            jsonrpc: "2.0",
            id: requestId || null,
            error: {
              code: -32600,
              message:
                'Invalid Request: jsonrpc must be "2.0" and id is required',
            },
          },
          400
        );
      }

      // Verify the requested agent exists
      const agent = mastra.getAgent(agentId);
      if (!agent) {
        return c.json(
          {
            jsonrpc: "2.0",
            id: requestId,
            error: {
              code: -32602,
              message: `Agent '${agentId}' not found`,
            },
          },
          404
        );
      }

      // Extract request parameters
      const { message, messages, contextId, taskId, metadata, configuration } = params || {};
      
      // Determine if this is a blocking or non-blocking request
      // blocking=false means use async webhook pattern to avoid timeouts
      const isBlocking = configuration?.blocking !== false;
      
      // Extract webhook configuration for async responses
      const webhookConfig = configuration?.pushNotificationConfig;

      // Normalize messages into an array format
      let messagesList = [];
      if (message) {
        messagesList = [message];
      } else if (messages && Array.isArray(messages)) {
        messagesList = messages;
      }

      // Convert A2A message format to Mastra's expected format
      // A2A uses "parts" array, Mastra uses simple "content" string
      const mastraMessages = messagesList.map((msg) => ({
        role: msg.role,
        content:
          msg.parts
            ?.map((part: { kind: string; text: string; data: object }) => {
              if (part.kind === "text") return part.text;
              if (part.kind === "data") return JSON.stringify(part.data);
              return "";
            })
            .join("\n") || "",
      }));

      // Generate unique IDs for task tracking
      const finalTaskId = taskId || randomUUID();
      const finalContextId = contextId || randomUUID();

      // ===== ASYNC WEBHOOK PATTERN (NON-BLOCKING) =====
      // This prevents timeout errors for long-running agent tasks
      if (!isBlocking && webhookConfig) {
        // Step 1: Immediately return "submitted" state (< 1 second response)
        // This matches the format from your mentor's example
        const immediateResponse = {
          jsonrpc: "2.0",
          id: requestId,
          result: {
            id: finalTaskId,
            contextId: finalContextId,
            status: {
              state: "submitted", // Using "submitted" as per mentor's example
              timestamp: new Date().toISOString(),
            },
            history: messagesList.map((msg) => ({
              role: msg.role,
              parts: msg.parts,
              messageId: msg.messageId || randomUUID(),
              taskId: finalTaskId,
              contextId: finalContextId,
            })),
            kind: "task",
            metadata: metadata || {},
          },
        };

        // Step 2: Process agent in background (don't wait for completion)
        // When done, results will be sent to the webhook URL
        processAgentAsync(
          agent,
          mastraMessages,
          messagesList,
          finalTaskId,
          finalContextId,
          webhookConfig,
          agentId,
          metadata
        ).catch((error) => {
          console.error("Error processing agent asynchronously:", error);
        });

        // Step 3: Return immediately so Telex doesn't timeout
        return c.json(immediateResponse);
      }

      // ===== SYNCHRONOUS PATTERN (BLOCKING) =====
      // Original behavior: wait for agent to complete before responding
      // Only use this for fast operations (< 60 seconds)
      const response = await agent.generate(mastraMessages);
      const agentText = response.text || "";

      // Build artifacts array containing agent response
      const artifacts: any = [
        {
          artifactId: randomUUID(),
          name: `${agentId}Response`,
          parts: [{ kind: "text", text: agentText }],
        },
      ];

      // Include tool results as separate artifact if available
      if (response.toolResults && response.toolResults.length > 0) {
        artifacts.push({
          artifactId: randomUUID(),
          name: "ToolResults",
          parts: response.toolResults.map((result: any) => ({
            kind: "data",
            data: result,
          })),
        });
      }

      // Create the agent's response message
      const agentMessage = {
        role: "agent",
        parts: [{ kind: "text", text: agentText }],
        messageId: randomUUID(),
        taskId: finalTaskId,
        contextId: finalContextId,
      };

      // Build conversation history including the agent's response
      const history = [
        ...messagesList.map((msg) => ({
          role: msg.role,
          parts: msg.parts,
          messageId: msg.messageId || randomUUID(),
          taskId: finalTaskId,
          contextId: finalContextId,
        })),
        agentMessage,
      ];

      // Return completed response immediately (blocking mode)
      return c.json({
        jsonrpc: "2.0",
        id: requestId,
        result: {
          id: finalTaskId,
          contextId: finalContextId,
          status: {
            state: "completed",
            timestamp: new Date().toISOString(),
            message: agentMessage,
          },
          artifacts,
          history,
          kind: "task",
          metadata: metadata || {},
        },
      });
    } catch (error: any) {
      // Handle any unexpected errors
      return c.json(
        {
          jsonrpc: "2.0",
          id: null,
          error: {
            code: -32603,
            message: "Internal error",
            data: { details: error.message },
          },
        },
        500
      );
    }
  },
});

/**
 * Process agent asynchronously and send results via webhook
 * 
 * This function runs in the background after returning "submitted" state to the client.
 * When the agent completes (or fails), it sends the result to the webhook URL.
 * 
 * @param agent - The Mastra agent instance
 * @param mastraMessages - Messages in Mastra format
 * @param messagesList - Original A2A messages for history
 * @param taskId - Unique task identifier
 * @param contextId - Conversation context identifier
 * @param webhookConfig - Webhook URL and authentication config
 * @param agentId - Agent identifier for artifacts
 * @param metadata - Optional metadata from original request
 */
async function processAgentAsync(
  agent: any,
  mastraMessages: any[],
  messagesList: any[],
  taskId: string,
  contextId: string,
  webhookConfig: any,
  agentId: string,
  metadata?: any
) {
  try {
    // Execute the agent (this may take a long time)
    const response = await agent.generate(mastraMessages);
    const agentText = response.text || "";

    // Build artifacts containing the agent's response
    const artifacts: any = [
      {
        artifactId: randomUUID(),
        name: `${agentId}Response`,
        parts: [{ kind: "text", text: agentText }],
      },
    ];

    // Include tool results if the agent used any tools
    if (response.toolResults && response.toolResults.length > 0) {
      artifacts.push({
        artifactId: randomUUID(),
        name: "ToolResults",
        parts: response.toolResults.map((result: any) => ({
          kind: "data",
          data: result,
        })),
      });
    }

    // Create the agent's response message
    const agentMessage = {
      role: "agent",
      parts: [{ kind: "text", text: agentText }],
      messageId: randomUUID(),
      taskId: taskId,
      contextId: contextId,
    };

    // Build complete conversation history (user messages + agent response)
    const history = [
      ...messagesList.map((msg) => ({
        role: msg.role,
        parts: msg.parts,
        messageId: msg.messageId || randomUUID(),
        taskId: taskId,
        contextId: contextId,
      })),
      agentMessage,
    ];

    // ===== WEBHOOK RESPONSE PAYLOAD =====
    // This matches the format Telex expects for task updates
    const webhookPayload = {
      jsonrpc: "2.0",
      id: 1, // Simple ID for the webhook response
      result: {
        id: taskId,
        contextId: contextId,
        status: {
          state: "completed", // Task finished successfully
          timestamp: new Date().toISOString(),
          message: agentMessage, // Include the agent's message in status
        },
        artifacts, // Include all artifacts
        history, // Full conversation history
        kind: "task",
        metadata: metadata || {},
      },
    };

    // Prepare HTTP headers for webhook request
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Add Bearer token authentication if provided
    // Token comes from Telex in the original request
    if (webhookConfig.token && webhookConfig.authentication?.schemes?.includes("Bearer")) {
      headers["Authorization"] = `Bearer ${webhookConfig.token}`;
    }

    console.log("Sending webhook to:", webhookConfig.url);

    // Send the completed result to Telex via webhook
    const webhookResponse = await fetch(webhookConfig.url, {
      method: "POST",
      headers,
      body: JSON.stringify(webhookPayload),
    });

    // Log webhook delivery status
    if (!webhookResponse.ok) {
      const errorText = await webhookResponse.text();
      console.error(
        `Webhook delivery failed: ${webhookResponse.status} ${webhookResponse.statusText}`,
        errorText
      );
    } else {
      console.log("Webhook delivered successfully");
    }
  } catch (error) {
    console.error("Error in async agent processing:", error);
    
    // If agent processing fails, notify Telex via webhook
    try {
      const errorPayload = {
        jsonrpc: "2.0",
        id: 1,
        result: {
          id: taskId,
          contextId: contextId,
          status: {
            state: "failed", // Task failed
            timestamp: new Date().toISOString(),
            error: {
              code: -32603,
              message: "Agent processing failed",
              data: { details: (error as Error).message },
            },
          },
          history: messagesList.map((msg) => ({
            role: msg.role,
            parts: msg.parts,
            messageId: msg.messageId || randomUUID(),
            taskId: taskId,
            contextId: contextId,
          })),
          kind: "task",
          metadata: metadata || {},
        },
      };

      // Prepare headers with authentication
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (webhookConfig.token && webhookConfig.authentication?.schemes?.includes("Bearer")) {
        headers["Authorization"] = `Bearer ${webhookConfig.token}`;
      }

      console.log("Sending error webhook to:", webhookConfig.url);

      // Send error notification to webhook
      await fetch(webhookConfig.url, {
        method: "POST",
        headers,
        body: JSON.stringify(errorPayload),
      });
    } catch (webhookError) {
      // Log if even the error notification fails
      console.error("Failed to send error webhook:", webhookError);
    }
  }
}