// src/tools/historical-rate-tool.ts
import { createTool } from '@mastra/core';
import { z } from 'zod';
import { config } from '../config/settings';

export const historicalRateTool = createTool({
    id: 'historicalRateTool',
    description: 'Get historical exchange rates for analysis and trends',
    inputSchema: z.object({
        source: z.string().describe('Source currency code').default('USD'),
        currencies: z.array(z.string()).describe('Target currency codes'),
        date: z.string().describe('Date in YYYY-MM-DD format'),
    }),
    execute: async ({ context }) => {
        const { source, currencies, date } = context;

        try {
            const currencyList = currencies.join(',');
            const apiKey = config.currencyKey;

            const response = await fetch(
                `https://api.currencylayer.com/historical?access_key=${apiKey}&date=${date}&currencies=${currencyList}&source=${source}&format=1`
            );

            if (!response.ok) {
                throw new Error('Failed to fetch historical rates');
            }

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error?.info || 'API error');
            }

            // Format the response
            const rates: Record<string, number> = {};

            Object.keys(data.quotes).forEach(key => {
                const targetCurrency = key.replace(source, '');
                rates[targetCurrency] = data.quotes[key];
            });

            return {
                success: true,
                data: {
                    source: data.source,
                    date: data.date,
                    historical: data.historical,
                    rates: rates,
                    formatted: Object.keys(rates).map(currency => ({
                        pair: `${source}/${currency}`,
                        rate: rates[currency],
                        date: data.date,
                    })),
                },
            };

        } catch (error) {
            console.error('Historical rate error:', error);
            return {
                success: false,
                error: `Unable to fetch historical rates: ${error}`,
            };
        }
    },
});