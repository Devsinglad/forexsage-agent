// src/api/routes/daily-forex-report-a2a-route.ts
import { registerApiRoute } from '@mastra/core/server';
import { randomUUID } from 'crypto';

export const dailyForexReportA2ARoute = registerApiRoute('/a2a/workflow/daily-forex-report', {
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

            const workflow = mastra.getWorkflow('daily-forex-report');
            if (!workflow) {
                return c.json({
                    jsonrpc: '2.0',
                    id: requestId,
                    error: {
                        code: -32602,
                        message: 'Daily Forex Report workflow not found'
                    }
                }, 404);
            }

            const { triggerData, contextId, taskId, metadata } = params || {};

            if (!triggerData || !triggerData.watchlist || !Array.isArray(triggerData.watchlist)) {
                return c.json({
                    jsonrpc: '2.0',
                    id: requestId,
                    error: {
                        code: -32602,
                        message: 'Invalid params: watchlist array is required',
                        data: {
                            requiredFields: {
                                watchlist: 'array of {source, target} objects'
                            },
                            example: {
                                watchlist: [
                                    { source: 'USD', target: 'NGN' },
                                    { source: 'EUR', target: 'USD' },
                                    { source: 'GBP', target: 'USD' }
                                ]
                            }
                        }
                    }
                }, 400);
            }

            const result = await workflow.execute(triggerData);

            const artifacts = [
                {
                    artifactId: randomUUID(),
                    name: 'DailyForexReport',
                    parts: [
                        {
                            kind: 'text',
                            text: result.dailyReport || 'Daily report completed'
                        }
                    ]
                },
                {
                    artifactId: randomUUID(),
                    name: 'ReportData',
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
                    parts: [{ kind: 'text', text: result.dailyReport || 'Daily report completed' }],
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
                                    text: `Daily forex report for ${triggerData.watchlist.length} pairs completed`
                                }
                            ],
                            kind: 'message'
                        }
                    },
                    artifacts,
                    history,
                    kind: 'task',
                    metadata: {
                        workflowId: 'daily-forex-report',
                        workflowName: 'Daily Forex Report',
                        ...metadata
                    }
                }
            });

        } catch (error: any) {
            console.error('Daily Forex Report A2A Error:', error);

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