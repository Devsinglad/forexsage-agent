// src/api/routes/arbitrage-opportunity-a2a-route.ts
import { registerApiRoute } from '@mastra/core/server';
import { randomUUID } from 'crypto';

export const arbitrageOpportunityA2ARoute = registerApiRoute('/a2a/workflow/arbitrage-opportunity', {
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

            const workflow = mastra.getWorkflow('arbitrage-opportunity');
            if (!workflow) {
                return c.json({
                    jsonrpc: '2.0',
                    id: requestId,
                    error: {
                        code: -32602,
                        message: 'Arbitrage Opportunity workflow not found'
                    }
                }, 404);
            }

            const { triggerData, contextId, taskId, metadata } = params || {};

            if (!triggerData || !triggerData.currencies || !Array.isArray(triggerData.currencies)) {
                return c.json({
                    jsonrpc: '2.0',
                    id: requestId,
                    error: {
                        code: -32602,
                        message: 'Invalid params: currencies array is required',
                        data: {
                            requiredFields: {
                                currencies: 'array of currency codes',
                                minimumSpread: 'number (optional, default: 0.5)'
                            },
                            example: {
                                currencies: ['USD', 'EUR', 'GBP', 'NGN'],
                                minimumSpread: 0.5
                            }
                        }
                    }
                }, 400);
            }

            const result = await workflow.execute(triggerData);

            const artifacts = [
                {
                    artifactId: randomUUID(),
                    name: 'ArbitrageOpportunityReport',
                    parts: [
                        {
                            kind: 'text',
                            text: result.report || 'Arbitrage analysis completed'
                        }
                    ]
                },
                {
                    artifactId: randomUUID(),
                    name: 'ArbitrageData',
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
                    parts: [{ kind: 'text', text: result.report || 'Arbitrage analysis completed' }],
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
                                    text: `Arbitrage opportunity analysis for ${triggerData.currencies.length} currencies completed`
                                }
                            ],
                            kind: 'message'
                        }
                    },
                    artifacts,
                    history,
                    kind: 'task',
                    metadata: {
                        workflowId: 'arbitrage-opportunity',
                        workflowName: 'Arbitrage Opportunity Detection',
                        ...triggerData,
                        ...metadata
                    }
                }
            });

        } catch (error: any) {
            console.error('Arbitrage Opportunity A2A Error:', error);

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