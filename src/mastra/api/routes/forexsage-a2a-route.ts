import { registerApiRoute } from "@mastra/core/server";
import { randomUUID } from "crypto";

// Webhook notification function
async function sendWebhookNotification(
  webhookUrl: string,
  result: any,
  token?: string,
  authSchemes?: string[]
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  console.log("Sending webhook notification to:", webhookUrl);
  console.log("Notification payload:", JSON.stringify(result, null, 2));

  // Add authentication if provided
  if (token && authSchemes?.includes("Bearer")) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(result),
    });

    if (!response.ok) {
      console.error(`Webhook notification failed: ${response.statusText}`);
    }
  } catch (error) {
    console.error("Error sending webhook notification:", error);
  }
}

export const a2aAgentRoute = registerApiRoute("/a2a/agent/:agentId", {
  method: "POST",
  handler: async (c) => {
    try {
      const mastra = c.get("mastra");
      const agentId = c.req.param("agentId");

      // Parse JSON-RPC 2.0 request
      const body = await c.req.json();
      const { jsonrpc, id: requestId, method, params } = body;

      // Validate JSON-RPC 2.0 format
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

      // Extract configuration
      const {
        message,
        messages,
        contextId,
        taskId,
        metadata,
        configuration
      } = params || {};

      const webhookConfig = configuration?.pushNotificationConfig;
      const isBlocking = configuration?.blocking !== false; // default to true if not specified

      let messagesList = [];
      if (message) {
        messagesList = [message];
      } else if (messages && Array.isArray(messages)) {
        messagesList = messages;
      }

      // Convert A2A messages to Mastra format
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

      const generatedTaskId = taskId || randomUUID();
      const generatedContextId = contextId || randomUUID();

      // Function to build the final result
      const buildResult = (agentText: string, toolResults?: any[]) => {
        const artifacts: any = [
          {
            artifactId: randomUUID(),
            name: `${agentId}Response`,
            parts: [{ kind: "text", text: agentText }],
          },
        ];

        if (toolResults && toolResults.length > 0) {
          artifacts.push({
            artifactId: randomUUID(),
            name: "ToolResults",
            parts: toolResults.map((result) => ({
              kind: "data",
              data: result,
            })),
          });
        }

        const history = [
          ...messagesList.map((msg) => ({
            kind: "message",
            role: msg.role,
            parts: msg.parts,
            messageId: msg.messageId || randomUUID(),
            taskId: msg.taskId || generatedTaskId,
          })),
          {
            kind: "message",
            role: "agent",
            parts: [{ kind: "text", text: agentText }],
            messageId: randomUUID(),
            taskId: generatedTaskId,
          },
        ];

        return {
          jsonrpc: "2.0",
          id: requestId,
          result: {
            id: generatedTaskId,
            contextId: generatedContextId,
            status: {
              state: "working",
              timestamp: new Date().toISOString(),
              message: {
                messageId: randomUUID(),
                role: "agent",
                parts: [{ kind: "text", text: agentText }],
                kind: "message",
              },
            },
            artifacts,
            history,
            kind: "task",
          },
        };
      };

      // Non-blocking mode: return immediately and process in background
      if (!isBlocking && webhookConfig?.url) {
        // Return immediate "processing" response
        const immediateResponse = {
          jsonrpc: "2.0",
          id: requestId,
          result: {
            id: generatedTaskId,
            contextId: generatedContextId,
            status: {
              state: "working",
              timestamp: new Date().toISOString(),
            },
            kind: "task",
          },
        };

        // Process agent in background
        (async () => {
          try {
            const response = await agent.generate(mastraMessages);
            const agentText = response.text || "";

            const finalResult = buildResult(agentText, response.toolResults);

            // Send webhook notification
            await sendWebhookNotification(
              webhookConfig.url,
              finalResult,
              webhookConfig.token,
              webhookConfig.authentication?.schemes
            );
          } catch (error: any) {
            // Send error notification to webhook
            const errorResult = {
              jsonrpc: "2.0",
              id: requestId,
              result: {
                id: generatedTaskId,
                contextId: generatedContextId,
                status: {
                  state: "failed",
                  timestamp: new Date().toISOString(),
                  error: {
                    code: -32603,
                    message: "Agent execution failed",
                    data: { details: error.message },
                  },
                },
                kind: "task",
              },
            };

            await sendWebhookNotification(
              webhookConfig.url,
              errorResult,
              webhookConfig.token,
              webhookConfig.authentication?.schemes
            );
          }
        })();

        return c.json(immediateResponse);
      } else {
        // Blocking mode: wait for completion
        const response = await agent.generate(mastraMessages);
        const agentText = response.text || "";

        return c.json(buildResult(agentText, response.toolResults));

      }



    } catch (error: any) {
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