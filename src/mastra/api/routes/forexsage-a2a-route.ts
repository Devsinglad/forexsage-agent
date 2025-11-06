import { registerApiRoute } from "@mastra/core/server";
import { randomUUID } from "crypto";
import { Worker } from 'worker_threads';
import { da } from "zod/locales";




// Webhook notification function
export async function sendWebhookNotification(
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

      // Check if this is a blocking or non-blocking request
      if (!isBlocking && webhookConfig?.url) {
        // Non-blocking mode: return immediately and process in background
        const immediateResponse = {
          jsonrpc: "2.0",
          id: requestId,
          result: {
            id: generatedTaskId,
            contextId: generatedContextId,
            status: {
              state: "submitted",
              timestamp: new Date().toISOString(),
            },
            kind: "task",
          },
        };

        // Resolve the worker path relative to the compiled output

        const data = {
          mastraMessages,
          agentId,
          mastra,
          messagesList,
          generatedTaskId,
          requestId,
          generatedContextId,
          webhookConfig,
        };
        const telexWorker = new Worker(
          blob(data), { eval: true },
        );
        telexWorker.postMessage(data);

        // Handle worker errors
        telexWorker.on('error', (error) => {
          console.error('Worker error:', error);
        });

        telexWorker.on('exit', (code) => {
          if (code !== 0) {
            console.error(`Worker stopped with exit code ${code}`);
          }
        });

        // Return immediate response
        return c.json(immediateResponse);
      } else {
        // Blocking mode: wait for completion
        const response = await agent.generate(mastraMessages);
        const agentText = response.text || "";
        const finalResult = buildResult(
          agentText,
          agentId,
          messagesList,
          generatedTaskId,
          requestId,
          generatedContextId,
          response.toolResults,
        );

        // Return the final result
        return c.json(finalResult);
      }

    } catch (error: any) {
      console.error("Error processing A2A agent request:", error);
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

// Function to build the final result
export const buildResult = (agentText: string, agentId: string, messagesList: any[], generatedTaskId: any, requestId: any, generatedContextId: any, toolResults?: any[],) => {
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
      parts: toolResults.map((result: any) => ({
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
        state: "completed",
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



const blob = (data: any) => `
import { parentPort, workerData } from 'node:worker_threads';
import { randomUUID } from "crypto";


// This is the worker thread implementation
// It processes agent requests in a separate thread

// When a message from the parent thread is received, process it
parentPort?.on('message', async (data) => {
  try {
    // Process agent in background without waiting
    (async () => {
      try {
         const agent = data.mastra.getAgent(data.agentId);

        const response = await data.agent.generate(data.mastraMessages);
        const agentText = response.text || "";
        const artifacts: any = [
          {
            artifactId: randomUUID(),
            name: "${data.agentId}Response",
            parts: [{ kind: "text", text: agentText }],
          },
        ];

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

        const history = [
          ...data.messagesList.map((msg: any) => ({
            kind: "message",
            role: msg.role,
            parts: msg.parts,
            messageId: msg.messageId || randomUUID(),
            taskId: msg.taskId || data.generatedTaskId,
          })),
          {
            kind: "message",
            role: "agent",
            parts: [{ kind: "text", text: agentText }],
            messageId: randomUUID(),
            taskId: data.generatedTaskId,
          },
        ];

        const result = {
          jsonrpc: "2.0",
          id: data.requestId,
          result: {
            id: data.generatedTaskId,
            contextId: data.generatedContextId,
            status: {
              state: "completed",
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



        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };


        // Add authentication if provided
        if (data.webhookConfig.token && data.webhookConfig.authentication?.schemes?.includes("Bearer")) {
          headers["Authorization"] = "Bearer ${data.webhookConfig.token}";
        }

        try {
          const response = await fetch(data.webhookConfig.url, {
            method: "POST",
            headers,
            body: JSON.stringify(result),
          });

          if (!response.ok) {
            console.error("Webhook notification failed");
          }
        } catch (error) {
          console.error("Error sending webhook notification:", error);
        }

      } catch (error: any) {
        // Send error notification to webhook
        const errorResult = {
          jsonrpc: "2.0",
          id: data.requestId,
          result: {
            id: data.generatedTaskId,
            contextId: data.generatedContextId,
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

         const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };


        // Add authentication if provided
        if (data.webhookConfig.token && data.webhookConfig.authentication?.schemes?.includes("Bearer")) {
          headers["Authorization"] = "Bearer ${data.webhookConfig.token}";
        }

        try {
          const response = await fetch(data.webhookConfig.url, {
            method: "POST",
            headers,
            body: JSON.stringify(errorResult),
          });

          if (!response.ok) {
            console.error("Webhook notification failed");
          }
        } catch (error) {
          console.error("Error sending webhook notification:", error);
        }
      }
    })();

    // Send success back to parent thread
    // parentPort?.postMessage({ status: 'completed', message: 'Webhook sent successfully' });
  } catch (error) {
    console.error('Error in worker thread:', error);
  }
});

`;