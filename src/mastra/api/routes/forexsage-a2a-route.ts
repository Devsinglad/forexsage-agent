// src/api/routes/forexsage-a2a-route.ts
import { registerApiRoute } from '@mastra/core/server';
import { randomUUID } from 'crypto';

export const forexSageA2ARoute = registerApiRoute('/a2a/agent/forexSageAgent', {
  method: 'POST',
  handler: async (c) => {
    try {
      const mastra = c.get('mastra');
      
      // Parse JSON-RPC 2.0 request
      const body = await c.req.json();
      const { jsonrpc, id: requestId, method, params } = body;
      
      // Validate JSON-RPC 2.0 format
      if (jsonrpc !== '2.0' || !requestId) {
        return c.json({
          jsonrpc: '2.0',
          id: requestId || null,
          error: {
            code: -32600,
            message: 'Invalid Request: jsonrpc must be "2.0" and id is required'
          }
        }, 400);
      }
      
      // Get ForexSage agent
      const agent = mastra.getAgent('forexSageAgent');
      if (!agent) {
        return c.json({
          jsonrpc: '2.0',
          id: requestId,
          error: {
            code: -32602,
            message: 'ForexSage agent not found'
          }
        }, 404);
      }
      
      // Extract messages from params
      const { message, messages, contextId, taskId, metadata } = params || {};
      
      let messagesList = [];
      if (message) {
        messagesList = [message];
      } else if (messages && Array.isArray(messages)) {
        messagesList = messages;
      }
      
      if (messagesList.length === 0) {
        return c.json({
          jsonrpc: '2.0',
          id: requestId,
          error: {
            code: -32602,
            message: 'Invalid params: message or messages array is required'
          }
        }, 400);
      }
      
      // Convert A2A messages to Mastra format
      const mastraMessages = messagesList.map((msg: any) => ({
        role: msg.role,
        content: msg.parts?.map((part: any) => {
          if (part.kind === 'text') return part.text;
          if (part.kind === 'data') return JSON.stringify(part.data);
          return '';
        }).join('\n') || ''
      }));
      
      // Execute ForexSage agent
      const response = await agent.stream(mastraMessages);
      
      let agentText = '';
      for await (const chunk of response.textStream) {
        agentText += chunk;
      }
      
      // Build artifacts array
      const artifacts = [
        {
          artifactId: randomUUID(),
          name: 'ForexSageResponse',
          parts: [{ kind: 'text', text: agentText }]
        }
      ];
      
      // Add tool results as artifacts
      const toolResults = response.toolResults ? await response.toolResults : [];
      if (toolResults.length > 0) {
        artifacts.push({
          artifactId: randomUUID(),
          name: 'ForexToolResults',
          parts: toolResults.map((result: any) => ({
            kind: 'text',
            text: JSON.stringify(result)
          }))
        });
      }
      
      // Build conversation history
      const history = [
        ...messagesList.map((msg: any) => ({
          kind: 'message',
          role: msg.role,
          parts: msg.parts,
          messageId: msg.messageId || randomUUID(),
          taskId: msg.taskId || taskId || randomUUID(),
        })),
        {
          kind: 'message',
          role: 'agent',
          parts: [{ kind: 'text', text: agentText }],
          messageId: randomUUID(),
          taskId: taskId || randomUUID(),
        }
      ];
      
      // Return A2A-compliant response
      return c.json({
        jsonrpc: '2.0',
        id: requestId,
        result: {
          id: taskId || randomUUID(),
          contextId: contextId || randomUUID(),
          status: {
            state: 'completed',
            timestamp: new Date().toISOString(),
            message: {
              messageId: randomUUID(),
              role: 'agent',
              parts: [{ kind: 'text', text: agentText }],
              kind: 'message'
            }
          },
          artifacts,
          history,
          kind: 'task',
          metadata: {
            agentId: 'forexSageAgent',
            agentName: 'ForexSage',
            capabilities: [
              'live_exchange_rates',
              'historical_trends',
              'currency_conversion',
              'ai_projections',
              'volatility_analysis'
            ],
            ...metadata
          }
        }
      });
      
    } catch (error: any) {
      console.error('ForexSage A2A Error:', error);
      
      return c.json({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32603,
          message: 'Internal error',
          data: { details: error.message }
        }
      }, 500);
    }
  }
});