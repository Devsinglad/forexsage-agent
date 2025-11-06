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
            name: `${data.agentId}Response`,
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
          headers["Authorization"] = `Bearer ${data.webhookConfig.token}`;
        }

        try {
          const response = await fetch(data.webhookConfig.url, {
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
          headers["Authorization"] = `Bearer ${data.webhookConfig.token}`;
        }

        try {
          const response = await fetch(data.webhookConfig.url, {
            method: "POST",
            headers,
            body: JSON.stringify(errorResult),
          });

          if (!response.ok) {
            console.error(`Webhook notification failed: ${response.statusText}`);
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

