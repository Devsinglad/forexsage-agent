// src/api/routes/multi-currency-comparison-a2a-route.ts
import { registerApiRoute } from '@mastra/core/server';
import { randomUUID } from 'crypto';

export const multiCurrencyComparisonA2ARoute = registerApiRoute('/a2a/workflow/multi-currency-comparison', {
  method: 'POST',
  handler: async (c) => {
    try {
      const mastra = c.get('mastra');

      const body = await c.req.json();
      const { jsonrpc, id: requestId, method, params } = body;

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

      const workflow = mastra.getWorkflow('multi-currency-comparison');
      if (!workflow) {
        return c.json({
          jsonrpc: '2.0',
          id: requestId,
          error: {
            code: -32602,
            message: 'Multi-Currency Comparison workflow not found'
          }
        }, 404);
      }

      const { triggerData, contextId, taskId, metadata } = params || {};

      if (!triggerData || !triggerData.baseCurrency || !triggerData.targetCurrencies) {
        return c.json({
          jsonrpc: '2.0',
          id: requestId,
          error: {
            code: -32602,
            message: 'Invalid params: baseCurrency and targetCurrencies are required',
            data: {
              requiredFields: {
                baseCurrency: 'string (e.g., USD)',
                targetCurrencies: 'array of strings (e.g., ["NGN", "EUR", "GBP"])',
                period: '7days | 30days | 90days | 1year (optional, default: 30days)'
              },
              example: {
                baseCurrency: 'USD',
                targetCurrencies: ['NGN', 'EUR', 'GBP'],
                period: '30days'
              }
            }
          }
        }, 400);
      }

      const result = await workflow.execute(triggerData);

      // Handle the result structure properly - it might be wrapped
      const reportData = result && typeof result === 'object' ?
        (result.report || result.output?.result?.report || 'Comparison completed') :
        'Comparison completed';

      const artifacts = [
        {
          artifactId: randomUUID(),
          name: 'MultiCurrencyComparisonReport',
          parts: [
            {
              kind: 'text',
              text: reportData
            }
          ]
        },
        {
          artifactId: randomUUID(),
          name: 'ComparisonData',
          parts: [
            {
              kind: 'data',
              data: result
            }
          ]
        }
      ];

      const history = [
        {
          kind: 'message',
          role: 'user',
          parts: [{ kind: 'data', data: triggerData }],
          messageId: randomUUID(),
          taskId: taskId || randomUUID(),
        },
        {
          kind: 'message',
          role: 'workflow',
          parts: [{ kind: 'text', text: reportData }],
          messageId: randomUUID(),
          taskId: taskId || randomUUID(),
        }
      ];

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
              role: 'workflow',
              parts: [
                {
                  kind: 'text',
                  text: `Multi-currency comparison for ${triggerData.baseCurrency} completed`
                }
              ],
              kind: 'message'
            }
          },
          artifacts,
          history,
          kind: 'task',
          metadata: {
            workflowId: 'multi-currency-comparison',
            workflowName: 'Multi-Currency Comparison',
            ...triggerData,
            ...metadata
          }
        }
      });

    } catch (error: any) {
      console.error('Multi-Currency Comparison A2A Error:', error);

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