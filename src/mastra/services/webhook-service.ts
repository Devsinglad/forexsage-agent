import { randomUUID } from 'crypto';

export interface WebhookConfig {
  url: string;
  token: string;
  authentication: {
    schemes: string[];
  };
}

export interface WebhookPayload {
  jsonrpc: string;
  id: string;
  result: {
    id: string;
    contextId: string;
    status: {
      state: 'completed' | 'failed' | 'timeout';
      timestamp: string;
      message?: any;
      error?: {
        code: number;
        message: string;
        data?: any;
      };
    };
    artifacts?: any[];
    history?: any[];
    kind: string;
  };
}

export class WebhookService {
  private static instance: WebhookService;
  private pendingRequests: Map<string, { resolve: Function; reject: Function; timeout: NodeJS.Timeout }> = new Map();

  private constructor() {}

  public static getInstance(): WebhookService {
    if (!WebhookService.instance) {
      WebhookService.instance = new WebhookService();
    }
    return WebhookService.instance;
  }

  /**
   * Send webhook response with retry logic
   */
  public async sendWebhook(
    webhookConfig: WebhookConfig,
    payload: WebhookPayload,
    maxRetries = 3
  ): Promise<boolean> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add authentication header if Bearer scheme is specified
    if (webhookConfig.authentication?.schemes?.includes('Bearer')) {
      headers['Authorization'] = `Bearer ${webhookConfig.token}`;
    }

    let retryCount = 0;

    while (retryCount <= maxRetries) {
      try {
        console.log(`Sending webhook to ${webhookConfig.url} (attempt ${retryCount + 1})`);
        
        const response = await fetch(webhookConfig.url, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          console.log('Webhook sent successfully');
          return true;
        } else {
          console.error(`Webhook failed with status: ${response.status}`);
        }
      } catch (error) {
        console.error(`Webhook attempt ${retryCount + 1} failed:`, error);
      }

      retryCount++;
      
      // Exponential backoff
      if (retryCount <= maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 10000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    console.error('Webhook failed after all retries');
    return false;
  }

  /**
   * Register a pending request for timeout handling
   */
  public registerPendingRequest(
    requestId: string,
    resolve: Function,
    reject: Function,
    timeoutMs: number = 60000
  ): void {
    const timeout = setTimeout(() => {
      this.pendingRequests.delete(requestId);
      reject(new Error(`Request ${requestId} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    this.pendingRequests.set(requestId, { resolve, reject, timeout });
  }

  /**
   * Resolve a pending request
   */
  public resolvePendingRequest(requestId: string, result: any): boolean {
    const pending = this.pendingRequests.get(requestId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(requestId);
      pending.resolve(result);
      return true;
    }
    return false;
  }

  /**
   * Reject a pending request
   */
  public rejectPendingRequest(requestId: string, error: Error): boolean {
    const pending = this.pendingRequests.get(requestId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(requestId);
      pending.reject(error);
      return true;
    }
    return false;
  }

  /**
   * Get number of pending requests
   */
  public getPendingRequestCount(): number {
    return this.pendingRequests.size;
  }
}