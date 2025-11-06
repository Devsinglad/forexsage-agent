import { registerApiRoute } from "@mastra/core/server";
import { randomUUID } from "crypto";
import { TaskWorker } from "../../workers/task-worker";
import { WebhookService } from "../../services/webhook-service";

export const a2aAgentRoute = registerApiRoute("/a2a/agent/:agentId", {
  method: "POST",
  handler: async (c) => {
    let requestId: string | undefined;
    try {
      const mastra = c.get("mastra");
      const agentId = c.req.param("agentId") as 'forexSageAgent';
      const webhookService = WebhookService.getInstance();
      const taskWorker = TaskWorker.getInstance();

      // Parse JSON-RPC 2.0 request
      const body = await c.req.json();
      requestId = body.id;
      const { jsonrpc, method, params } = body;

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

      // Extract messages and configuration from params
      const { message, messages, contextId, taskId, metadata, configuration } = params || {};

      let messagesList = [];
      if (message) {
        messagesList = [message];
      } else if (messages && Array.isArray(messages)) {
        messagesList = messages;
      }

      // Check if webhook configuration is provided
      const webhookConfig = configuration?.pushNotificationConfig;
      const isBlocking = configuration?.blocking !== false; // Default to true
      const timeoutMs = 55000; // 55 seconds to stay under 60-second limit

      if (webhookConfig && !isBlocking) {
        // Non-blocking request with webhook - process in background
        const taskIdForBackground = taskId || randomUUID();
        
        taskWorker.addTask({
          agentId,
          messages: messagesList,
          contextId,
          taskId: taskIdForBackground,
          webhookConfig,
          metadata,
        });

        // Return immediate response indicating processing has started
        return c.json({
          jsonrpc: "2.0",
          id: requestId,
          result: {
            id: taskIdForBackground,
            contextId: contextId || randomUUID(),
            status: {
              state: "processing",
              timestamp: new Date().toISOString(),
              message: {
                messageId: randomUUID(),
                role: "agent",
                parts: [{ kind: "text", text: "Your request is being processed. You will receive the response via webhook." }],
                kind: "message",
              },
            },
            kind: "task",
          },
        });
      }

      // Blocking request or no webhook - process synchronously with timeout
      const executeWithTimeout = async () => {
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

        // Execute agent
        const response = await agent.generate(mastraMessages);
        const agentText = response.text || "";

        // Build artifacts array
        const artifacts: any = [
          {
            artifactId: randomUUID(),
            name: `${agentId}Response`,
            parts: [{ kind: "text", text: agentText }],
          },
        ];

        // Add tool results as artifacts
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

        // Build conversation history
        const history = [
          ...messagesList.map((msg) => ({
            kind: "message",
            role: msg.role,
            parts: msg.parts,
            messageId: msg.messageId || randomUUID(),
            taskId: msg.taskId || taskId || randomUUID(),
          })),
          {
            kind: "message",
            role: "agent",
            parts: [{ kind: "text", text: agentText }],
            messageId: randomUUID(),
            taskId: taskId || randomUUID(),
          },
        ];

        return {
          id: taskId || randomUUID(),
          contextId: contextId || randomUUID(),
          status: {
            state: "completed" as const,
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
          kind: "task" as const,
        };
      };

      try {
        const result = await Promise.race([
          executeWithTimeout(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Request timeout')), timeoutMs)
          )
        ]);

        // If webhook is configured and blocking, also send webhook
        if (webhookConfig && isBlocking) {
          const webhookPayload = {
            jsonrpc: "2.0",
            id: requestId,
            result: result as any,
          };
          
          // Send webhook asynchronously without waiting
          webhookService.sendWebhook(webhookConfig, webhookPayload).catch(error => {
            console.error('Failed to send webhook:', error);
          });
        }

        return c.json({
          jsonrpc: "2.0",
          id: requestId,
          result,
        });
      } catch (error: any) {
        // Handle timeout
        if (error.message === 'Request timeout') {
          if (webhookConfig) {
            // Fallback to webhook processing
            const taskIdForBackground = taskId || randomUUID();
            
            taskWorker.addTask({
              agentId,
              messages: messagesList,
              contextId,
              taskId: taskIdForBackground,
              webhookConfig,
              metadata,
            });

            return c.json({
              jsonrpc: "2.0",
              id: requestId,
              result: {
                id: taskIdForBackground,
                contextId: contextId || randomUUID(),
                status: {
                  state: "processing",
                  timestamp: new Date().toISOString(),
                  message: {
                    messageId: randomUUID(),
                    role: "agent",
                    parts: [{ kind: "text", text: "Request timed out. Your request is being processed in background. You will receive the response via webhook." }],
                    kind: "message",
                  },
                },
                kind: "task",
              },
            });
          } else {
            // No webhook fallback - return timeout error
            return c.json(
              {
                jsonrpc: "2.0",
                id: requestId,
                error: {
                  code: -32603,
                  message: "Request timeout after 60 seconds. Try using webhooks for longer processing.",
                  data: { details: "The request took too long to process. Consider using non-blocking mode with webhooks." },
                },
              },
              408
            );
          }
        }

        // Other errors
        throw error;
      }
    } catch (error: any) {
      return c.json(
        {
          jsonrpc: "2.0",
          id: requestId || null,
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