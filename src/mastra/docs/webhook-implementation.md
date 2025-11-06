# Webhook Implementation for ForexSage Agent

This document describes the webhook implementation that handles timeout scenarios for the ForexSage AI agent.

## Overview

The webhook system allows the AI agent to handle long-running requests that may exceed the 60-second timeout limit. When a request is about to timeout, it can be processed in the background and the results sent via webhook.

## Architecture

### Components

1. **WebhookService** (`src/mastra/services/webhook-service.ts`)
   - Handles sending webhook responses with retry logic
   - Manages pending requests and timeouts
   - Supports Bearer token authentication

2. **TaskWorker** (`src/mastra/workers/task-worker.ts`)
   - Background task queue processor
   - Executes agent requests asynchronously
   - Handles webhook delivery for completed tasks

3. **AsyncProcessor** (`src/mastra/utils/async-utils.ts`)
   - Utility functions for async processing
   - Timeout handling with webhook fallback
   - Retry logic with exponential backoff

4. **Webhook Receiver** (`src/mastra/api/routes/webhook-receiver-route.ts`)
   - Endpoint to receive webhook responses
   - Health check endpoint for monitoring

## API Usage

### Non-blocking Request with Webhook

Send a request with webhook configuration for non-blocking processing:

```json
{
  "jsonrpc": "2.0",
  "id": "your-request-id",
  "method": "message/send",
  "params": {
    "message": {
      "kind": "message",
      "role": "user",
      "parts": [
        {
          "kind": "text",
          "text": "exchange rate of usd to naira"
        }
      ]
    },
    "configuration": {
      "blocking": false,
      "pushNotificationConfig": {
        "url": "https://your-webhook-endpoint.com/receiver",
        "token": "your-bearer-token",
        "authentication": {
          "schemes": ["Bearer"]
        }
      }
    }
  }
}
```

### Blocking Request with Webhook Fallback

Send a blocking request that falls back to webhook on timeout:

```json
{
  "jsonrpc": "2.0",
  "id": "your-request-id",
  "method": "message/send",
  "params": {
    "message": {
      "kind": "message",
      "role": "user",
      "parts": [
        {
          "kind": "text",
          "text": "complex analysis request"
        }
      ]
    },
    "configuration": {
      "blocking": true,
      "pushNotificationConfig": {
        "url": "https://your-webhook-endpoint.com/receiver",
        "token": "your-bearer-token",
        "authentication": {
          "schemes": ["Bearer"]
        }
      }
    }
  }
}
```

## Response Formats

### Processing Response

When a request is moved to background processing:

```json
{
  "jsonrpc": "2.0",
  "id": "your-request-id",
  "result": {
    "id": "task-id",
    "contextId": "context-id",
    "status": {
      "state": "processing",
      "timestamp": "2025-11-06T18:00:00.000Z",
      "message": {
        "messageId": "message-id",
        "role": "agent",
        "parts": [
          {
            "kind": "text",
            "text": "Your request is being processed. You will receive the response via webhook."
          }
        ],
        "kind": "message"
      }
    },
    "kind": "task"
  }
}
```

### Webhook Payload

The webhook will receive the completed result:

```json
{
  "jsonrpc": "2.0",
  "id": "task-id",
  "result": {
    "id": "task-id",
    "contextId": "context-id",
    "status": {
      "state": "completed",
      "timestamp": "2025-11-06T18:01:00.000Z",
      "message": {
        "messageId": "response-id",
        "role": "agent",
        "parts": [
          {
            "kind": "text",
            "text": "The current exchange rate of USD to NGN is..."
          }
        ],
        "kind": "message"
      }
    },
    "artifacts": [...],
    "history": [...],
    "kind": "task"
  }
}
```

## Configuration Options

### Webhook Configuration

- `url`: The webhook endpoint URL
- `token`: Bearer token for authentication
- `authentication.schemes`: Array of authentication schemes (supports "Bearer")

### Request Configuration

- `blocking`: 
  - `false`: Process immediately in background, return processing response
  - `true`: Try to process synchronously, fallback to webhook on timeout

## Endpoints

### A2A Agent Endpoint
```
POST /a2a/agent/forexSageAgent
```

### Webhook Receiver
```
POST /webhook/receiver
```

### Webhook Health Check
```
GET /webhook/health
```

## Error Handling

### Timeout Error
If no webhook is configured and the request times out:

```json
{
  "jsonrpc": "2.0",
  "id": "your-request-id",
  "error": {
    "code": -32603,
    "message": "Request timeout after 60 seconds. Try using webhooks for longer processing.",
    "data": {
      "details": "The request took too long to process. Consider using non-blocking mode with webhooks."
    }
  }
}
```

## Retry Logic

The webhook service implements exponential backoff retry:

- **Max retries**: 3 (configurable)
- **Base delay**: 1000ms
- **Max delay**: 10000ms
- **Backoff factor**: 2^n

## Monitoring

### Health Check Response

```json
{
  "status": "healthy",
  "timestamp": "2025-11-06T18:00:00.000Z",
  "pendingRequests": 5
}
```

## Implementation Details

### Timeout Handling

- **Synchronous timeout**: 55 seconds (to stay under 60-second limit)
- **Background processing**: No timeout limit
- **Pending request tracking**: Automatic cleanup on timeout

### Worker Queue

- **Processing**: FIFO queue
- **Concurrency**: Single worker instance
- **Error handling**: Failed tasks trigger error webhooks
- **Status tracking**: Real-time queue status available

## Security Considerations

1. **Authentication**: Webhooks support Bearer token authentication
2. **Validation**: All webhook payloads are validated
3. **Error disclosure**: Sensitive details are not exposed in error responses
4. **Rate limiting**: Implement rate limiting on webhook endpoints (recommended)

## Best Practices

1. **Always include webhook configuration** for long-running requests
2. **Use non-blocking mode** for requests that typically take longer than 30 seconds
3. **Implement proper error handling** on your webhook receiver
4. **Monitor webhook health** using the health endpoint
5. **Log webhook deliveries** for debugging and audit trails

## Example Implementation

### Webhook Receiver Example (Node.js/Express)

```javascript
const express = require('express');
const app = express();

app.use(express.json());

app.post('/webhook/receiver', (req, res) => {
  const { jsonrpc, id, result, error } = req.body;
  
  if (error) {
    console.error(`Task ${id} failed:`, error);
    return res.status(500).json({ status: 'error_received' });
  }
  
  console.log(`Task ${id} completed:`, result);
  
  // Process the result (update database, notify user, etc.)
  
  res.json({ status: 'received', id });
});

app.listen(3000, () => {
  console.log('Webhook receiver listening on port 3000');
});