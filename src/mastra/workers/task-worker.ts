import { randomUUID } from 'crypto';
import { WebhookService, WebhookConfig, WebhookPayload } from '../services/webhook-service';

export interface TaskRequest {
  id: string;
  agentId: 'forexSageAgent';
  messages: any[];
  contextId?: string;
  taskId?: string;
  webhookConfig?: WebhookConfig;
  metadata?: any;
  timestamp: number;
}

export interface TaskResult {
  id: string;
  status: 'completed' | 'failed';
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  timestamp: number;
}

export class TaskWorker {
  private static instance: TaskWorker;
  private queue: TaskRequest[] = [];
  private processing = false;
  private webhookService: WebhookService;

  private constructor() {
    this.webhookService = WebhookService.getInstance();
  }

  public static getInstance(): TaskWorker {
    if (!TaskWorker.instance) {
      TaskWorker.instance = new TaskWorker();
    }
    return TaskWorker.instance;
  }

  /**
   * Add a task to the queue
   */
  public addTask(task: Omit<TaskRequest, 'id' | 'timestamp'>): string {
    const fullTask: TaskRequest = {
      ...task,
      id: randomUUID(),
      timestamp: Date.now(),
    };

    this.queue.push(fullTask);
    console.log(`Task ${fullTask.id} added to queue. Queue size: ${this.queue.length}`);
    
    // Start processing if not already running
    if (!this.processing) {
      this.processQueue();
    }

    return fullTask.id;
  }

  /**
   * Process the task queue
   */
  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;
    console.log('Starting to process task queue...');

    while (this.queue.length > 0) {
      const task = this.queue.shift()!;
      
      try {
        console.log(`Processing task ${task.id} for agent ${task.agentId}`);
        await this.processTask(task);
      } catch (error) {
        console.error(`Error processing task ${task.id}:`, error);
        
        // Send error webhook if configured
        if (task.webhookConfig) {
          await this.sendErrorWebhook(task, error);
        }
      }
    }

    this.processing = false;
    console.log('Finished processing task queue');
  }

  /**
   * Process a single task
   */
  private async processTask(task: TaskRequest): Promise<void> {
    try {
      // Import mastra dynamically to avoid circular dependencies
      const { mastra } = await import('../index');
      
      const agent = mastra.getAgent(task.agentId);
      if (!agent) {
        throw new Error(`Agent '${task.agentId}' not found`);
      }

      // Convert A2A messages to Mastra format
      const mastraMessages = task.messages.map((msg) => ({
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
          name: `${task.agentId}Response`,
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
        ...task.messages.map((msg) => ({
          kind: "message",
          role: msg.role,
          parts: msg.parts,
          messageId: msg.messageId || randomUUID(),
          taskId: msg.taskId || task.taskId || randomUUID(),
        })),
        {
          kind: "message",
          role: "agent",
          parts: [{ kind: "text", text: agentText }],
          messageId: randomUUID(),
          taskId: task.taskId || randomUUID(),
        },
      ];

      const result = {
        id: task.taskId || randomUUID(),
        contextId: task.contextId || randomUUID(),
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
        kind: "task",
      };

      // Send webhook if configured
      if (task.webhookConfig) {
        const payload: WebhookPayload = {
          jsonrpc: "2.0",
          id: task.id,
          result,
        };

        await this.webhookService.sendWebhook(task.webhookConfig, payload);
      }

    } catch (error) {
      console.error(`Task ${task.id} failed:`, error);
      
      // Send error webhook if configured
      if (task.webhookConfig) {
        await this.sendErrorWebhook(task, error);
      }
      
      throw error;
    }
  }

  /**
   * Send error webhook
   */
  private async sendErrorWebhook(task: TaskRequest, error: any): Promise<void> {
    if (!task.webhookConfig) return;

    const payload: WebhookPayload = {
      jsonrpc: "2.0",
      id: task.id,
      result: {
        id: task.taskId || randomUUID(),
        contextId: task.contextId || randomUUID(),
        status: {
          state: "failed",
          timestamp: new Date().toISOString(),
          error: {
            code: -32603,
            message: "Internal error",
            data: { details: error.message || String(error) },
          },
        },
        kind: "task",
      },
    };

    await this.webhookService.sendWebhook(task.webhookConfig, payload);
  }

  /**
   * Get queue status
   */
  public getQueueStatus(): { queueLength: number; processing: boolean } {
    return {
      queueLength: this.queue.length,
      processing: this.processing,
    };
  }
}