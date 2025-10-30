// src/tools/historical-trends-tool.ts
import { createTool } from '@mastra/core';
import { z } from 'zod';
import { config } from '../config/settings';


export const historicalTrendsTool = createTool({
    id: 'historicalTrendsTool',
    description: 'Get historical trends for currency pairs over a period',
    inputSchema: z.object({
        source: z.string().describe('Source currency code').default('USD'),
        target: z.string().describe('Target currency code (e.g., NGN)'),
        period: z.enum(['7days', '30days', '90days', '1year', '2years']).describe('Time period for trends'),
    }),
    execute: async ({ context }) => {
        const { source, target, period } = context;

        try {
            const apiKey = config.currencyKey;

            // Calculate dates to fetch
            const dates = calculateDatesForPeriod(period);

            // Fetch historical data for each date
            const historicalData: Array<{ date: string; rate: number }> = [];

            for (const date of dates) {
                try {
                    const response = await fetch(
                        `https://api.currencylayer.com/historical?access_key=${apiKey}&date=${date}&currencies=${target}&source=${source}&format=1`
                    );

                    const data = await response.json();

                    if (data.success && data.quotes) {
                        const quoteKey = `${source}${target}`;
                        if (data.quotes[quoteKey]) {
                            historicalData.push({
                                date: data.date,
                                rate: data.quotes[quoteKey],
                            });
                        }
                    }

                    // Add small delay to avoid rate limiting
                    await new Promise(resolve => setTimeout(resolve, 100));

                } catch (error) {
                    console.error(`Error fetching data for ${date}:`, error);
                }
            }

            if (historicalData.length === 0) {
                throw new Error('No historical data available');
            }

            // Calculate statistics
            const rates = historicalData.map(d => d.rate);
            const highest = Math.max(...rates);
            const lowest = Math.min(...rates);
            const average = rates.reduce((a, b) => a + b, 0) / rates.length;
            const current = rates[rates.length - 1];
            const oldest = rates[0];
            const change = ((current - oldest) / oldest) * 100;

            return {
                success: true,
                data: {
                    pair: `${source}/${target}`,
                    period: period,
                    historicalData: historicalData,
                    statistics: {
                        highest: {
                            rate: highest,
                            date: historicalData.find(d => d.rate === highest)?.date,
                        },
                        lowest: {
                            rate: lowest,
                            date: historicalData.find(d => d.rate === lowest)?.date,
                        },
                        average: average,
                        current: current,
                        change: change,
                        changeFormatted: `${change > 0 ? '+' : ''}${change.toFixed(2)}%`,
                        volatility: calculateVolatility(rates),
                    },
                    trend: change > 0 ? 'upward' : change < 0 ? 'downward' : 'stable',
                },
            };

        } catch (error) {
            console.error('Historical trends error:', error);
            return {
                success: false,
                error: `Unable to fetch historical trends: ${error}`,
            };
        }
    },
});

// Helper: Calculate dates for period
function calculateDatesForPeriod(period: string): string[] {
    const dates: string[] = [];
    const today = new Date();

    let daysBack: number;
    let interval: number;

    switch (period) {
        case '7days':
            daysBack = 7;
            interval = 1; // Daily
            break;
        case '30days':
            daysBack = 30;
            interval = 3; // Every 3 days
            break;
        case '90days':
            daysBack = 90;
            interval = 7; // Weekly
            break;
        case '1year':
            daysBack = 365;
            interval = 30; // Monthly
            break;
        case '2years':
            daysBack = 730;
            interval = 60; // Bi-monthly
            break;
        default:
            daysBack = 30;
            interval = 3;
    }

    for (let i = daysBack; i >= 0; i -= interval) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        dates.push(date.toISOString().split('T')[0]);
    }

    return dates;
}

// Helper: Calculate volatility (standard deviation)
function calculateVolatility(rates: number[]): number {
    const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
    const squaredDiffs = rates.map(rate => Math.pow(rate - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / rates.length;
    return Math.sqrt(variance);
}