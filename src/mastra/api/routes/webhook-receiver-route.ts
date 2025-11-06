import { registerApiRoute } from "@mastra/core/server";
import { WebhookService } from "../../services/webhook-service";

export const webhookReceiverRoute = registerApiRoute("/webhook/receiver", {
  method: "POST",
  handler: async (c) => {
    try {
      const webhookService = WebhookService.getInstance();
      const body = await c.req.json();
      
      console.log('Received webhook:', JSON.stringify(body, null, 2));

      // Validate webhook payload structure
      if (!body.jsonrpc || body.jsonrpc !== "2.0") {
        return c.json(
          {
            error: "Invalid JSON-RPC 2.0 format",
          },
          400
        );
      }

      const { id, result, error } = body;

      if (error) {
        console.error(`Webhook error for request ${id}:`, error);
        return c.json({
          status: "error_received",
          id,
          timestamp: new Date().toISOString(),
        });
      }

      if (result) {
        console.log(`Webhook result received for request ${id}:`, result);
        
        // If this is a response to a pending request, resolve it
        if (id && typeof id === 'string') {
          const resolved = webhookService.resolvePendingRequest(id, result);
          if (resolved) {
            console.log(`Resolved pending request ${id}`);
          }
        }

        return c.json({
          status: "received",
          id,
          timestamp: new Date().toISOString(),
        });
      }

      return c.json({
        status: "processed",
        timestamp: new Date().toISOString(),
      });

    } catch (error: any) {
      console.error('Webhook processing error:', error);
      return c.json(
        {
          error: "Internal server error",
          details: error.message,
        },
        500
      );
    }
  },
});

// Health check endpoint for webhooks
export const webhookHealthRoute = registerApiRoute("/webhook/health", {
  method: "GET",
  handler: async (c) => {
    const webhookService = WebhookService.getInstance();
    const pendingCount = webhookService.getPendingRequestCount();
    
    return c.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      pendingRequests: pendingCount,
    });
  },
});