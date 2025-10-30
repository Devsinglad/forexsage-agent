// src/tools/live-exchange-rate-tool.ts
import { createTool } from '@mastra/core';
import { z } from 'zod';
import { config } from '../config/settings';

export const liveExchangeRateTool = createTool({
    id: 'liveExchangeRateTool',
    description: 'Get real-time exchange rates for currency pairs',
    inputSchema: z.object({
        source: z.string().describe('Source currency code (e.g., USD, EUR, GBP)').default('USD'),
        currencies: z.array(z.string()).describe('Target currency codes (e.g., NGN, EUR, GBP)'),
    }),
    execute: async ({ context }) => {
        const { source, currencies } = context;

        try {
            const currencyList = currencies.join(',');
            const apiKey = config.currencyKey;

            const response = await fetch(
                `https://api.currencylayer.com/live?access_key=${apiKey}&currencies=${currencyList}&source=${source}&format=1`
            );

            if (!response.ok) {
                throw new Error('Failed to fetch exchange rates');
            }

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error?.info || 'API error');
            }

            // Format the response
            const rates: Record<string, number> = {};
            const timestamp = new Date(data.timestamp * 1000);

            Object.keys(data.quotes).forEach(key => {
                // Extract target currency from quote key (e.g., USDNGN -> NGN)
                const targetCurrency = key.replace(source, '');
                rates[targetCurrency] = data.quotes[key];
            });

            return {
                success: true,
                data: {
                    source: data.source,
                    timestamp: timestamp.toISOString(),
                    rates: rates,
                    formatted: Object.keys(rates).map(currency => ({
                        pair: `${source}/${currency}`,
                        rate: rates[currency],
                        formattedRate: `1 ${source} = ${rates[currency].toFixed(4)} ${currency}`,
                    })),
                },
            };

        } catch (error) {
            console.error('Live exchange rate error:', error);
            return {
                success: false,
                error: `Unable to fetch exchange rates: ${error}`,
            };
        }
    },
});