import { registerApiRoute } from '@mastra/core/server';
import { randomUUID } from 'crypto';

export const completeForexAnalysisA2ARoute = registerApiRoute('/a2a/workflow/complete-forex-analysis', {
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
      
      // Get the workflow
      const workflow = mastra.getWorkflow('complete-forex-analysis');
      if (!workflow) {
        return c.json({
          jsonrpc: '2.0',
          id: requestId,
          error: {
            code: -32602,
            message: 'Complete Forex Analysis workflow not found'
          }
        }, 404);
      }
      
      // Extract workflow parameters
      const { triggerData, contextId, taskId, metadata } = params || {};
      
      if (!triggerData) {
        return c.json({
          jsonrpc: '2.0',
          id: requestId,
          error: {
            code: -32602,
            message: 'Invalid params: triggerData is required',
            data: {
              requiredFields: {
                sourceCurrency: 'string (e.g., USD)',
                targetCurrency: 'string (e.g., NGN)',
                analysisDepth: 'basic | detailed | comprehensive (optional, default: detailed)'
              },
              example: {
                sourceCurrency: 'USD',
                targetCurrency: 'NGN',
                analysisDepth: 'detailed'
              }
            }
          }
        }, 400);
      }
      
      // Validate required fields
      if (!triggerData.sourceCurrency || !triggerData.targetCurrency) {
        return c.json({
          jsonrpc: '2.0',
          id: requestId,
          error: {
            code: -32602,
            message: 'Invalid params: sourceCurrency and targetCurrency are required'
          }
        }, 400);
      }
      
      // Execute workflow
      const result = await workflow.execute(triggerData);
      
      // Build artifacts from workflow result
      const artifacts = [
        {
          artifactId: randomUUID(),
          name: 'CompleteForexAnalysis',
          parts: [
            {
              kind: 'text',
              text: result.aiAnalysis || result.projections || 'Analysis completed'
            }
          ]
        },
        {
          artifactId: randomUUID(),
          name: 'RawAnalysisData',
          parts: [
            {
              kind: 'data',
              data: result
            }
          ]
        }
      ];
      
      // Build history
      const history = [
        {
          kind: 'message',
          role: 'user',
          parts: [
            {
              kind: 'data',
              data: triggerData
            }
          ],
          messageId: randomUUID(),
          taskId: taskId || randomUUID(),
        },
        {
          kind: 'message',
          role: 'workflow',
          parts: [
            {
              kind: 'text',
              text: result.aiAnalysis || result.projections || 'Analysis completed'
            }
          ],
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
              role: 'workflow',
              parts: [
                {
                  kind: 'text',
                  text: `Complete forex analysis for ${triggerData.sourceCurrency}/${triggerData.targetCurrency} completed`
                }
              ],
              kind: 'message'
            }
          },
          artifacts,
          history,
          kind: 'task',
          metadata: {
            workflowId: 'complete-forex-analysis',
            workflowName: 'Complete Forex Analysis',
            ...triggerData,
            ...metadata
          }
        }
      });
      
    } catch (error: any) {
      console.error('Complete Forex Analysis A2A Error:', error);
      
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