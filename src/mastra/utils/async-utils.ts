import { randomUUID } from 'crypto';
import { WebhookService, WebhookConfig } from '../services/webhook-service';

export interface AsyncProcessOptions {
  timeoutMs?: number;
  webhookConfig?: WebhookConfig;
  fallbackToWebhook?: boolean;
  taskId?: string;
  contextId?: string;
}

export class AsyncProcessor {
  private static instance: AsyncProcessor;
  private webhookService: WebhookService;

  private constructor() {
    this.webhookService = WebhookService.getInstance();
  }

  public static getInstance(): AsyncProcessor {
    if (!AsyncProcessor.instance) {
      AsyncProcessor.instance = new AsyncProcessor();
    }
    return AsyncProcessor.instance;
  }

  /**
   * Execute a function with timeout and webhook fallback
   */
  public async executeWithFallback<T>(
    fn: () => Promise<T>,
    options: AsyncProcessOptions = {}
  ): Promise<T | { state: 'processing'; taskId: string }> {
    const {
      timeoutMs = 55000,
      webhookConfig,
      fallbackToWebhook = true,
      taskId = randomUUID(),
      contextId = randomUUID(),
    } = options;

    try {
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), timeoutMs)
        )
      ]);

      // If webhook is configured, also send result asynchronously
      if (webhookConfig) {
        this.sendWebhookAsync(webhookConfig, {
          jsonrpc: "2.0",
          id: taskId,
          result: result as any,
        }).catch(error => {
          console.error('Failed to send webhook:', error);
        });
      }

      return result;
    } catch (error: any) {
      // Handle timeout
      if (error.message === 'Request timeout') {
        if (webhookConfig && fallbackToWebhook) {
          console.log(`Request timed out, falling back to webhook processing for task ${taskId}`);
          
          return {
            state: 'processing' as const,
            taskId,
          };
        } else {
          throw new Error(`Request timeout after ${timeoutMs}ms. Try using webhooks for longer processing.`);
        }
      }

      // Other errors
      throw error;
    }
  }

  /**
   * Send webhook asynchronously without blocking
   */
  private async sendWebhookAsync(
    webhookConfig: WebhookConfig,
    payload: any
  ): Promise<void> {
    // Don't await this - fire and forget
    this.webhookService.sendWebhook(webhookConfig, payload);
  }

  /**
   * Create a processing response for async tasks
   */
  public createProcessingResponse(
    taskId: string,
    contextId: string,
    message: string = "Your request is being processed. You will receive the response via webhook."
  ) {
    return {
      id: taskId,
      contextId,
      status: {
        state: "processing" as const,
        timestamp: new Date().toISOString(),
        message: {
          messageId: randomUUID(),
          role: "agent" as const,
          parts: [{ kind: "text" as const, text: message }],
          kind: "message" as const,
        },
      },
      kind: "task" as const,
    };
  }

  /**
   * Create a timeout error response
   */
  public createTimeoutResponse() {
    return {
      jsonrpc: "2.0",
      error: {
        code: -32603,
        message: "Request timeout after 60 seconds. Try using webhooks for longer processing.",
        data: { details: "The request took too long to process. Consider using non-blocking mode with webhooks." },
      },
    };
  }
}

/**
 * Utility function to create a timeout promise
 */
export function createTimeoutPromise(timeoutMs: number): Promise<never> {
  return new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Request timeout')), timeoutMs)
  );
}

/**
 * Utility function to retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === maxRetries) {
        throw lastError;
      }

      const delay = Math.min(baseDelay * Math.pow(2, attempt), 10000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}