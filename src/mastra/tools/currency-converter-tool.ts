// src/tools/currency-converter-tool.ts
import { createTool } from '@mastra/core';
import { z } from 'zod';
import { config } from '../config/settings';


export const currencyConverterTool = createTool({
  id: 'currencyConverterTool',
  description: 'Convert amount from one currency to another',
  inputSchema: z.object({
    from: z.string().describe('Source currency code'),
    to: z.string().describe('Target currency code'),
    amount: z.number().describe('Amount to convert'),
  }),
  execute: async ({ context }) => {
    const { from, to, amount } = context;

    try {
      const apiKey = config.currencyKey;

      if (!apiKey) {
        throw new Error('CURRENCYLAYER_API_KEY is not configured');
      }

      if (!from || !to || amount <= 0) {
        throw new Error('Invalid input: from, to currencies and positive amount are required');
      }

      const response = await fetch(
        `https://api.currencylayer.com/convert?access_key=${apiKey}&from=${from}&to=${to}&amount=${amount}&format=1`
      );

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error?.info || 'API error');
      }

      return {
        success: true,
        data: {
          from: data.query.from,
          to: data.query.to,
          amount: data.query.amount,
          result: data.result,
          rate: data.info.quote,
          timestamp: new Date(data.info.timestamp * 1000).toISOString(),
          formatted: `${amount.toFixed(2)} ${from} = ${data.result.toFixed(2)} ${to}`,
          rateFormatted: `1 ${from} = ${data.info.quote.toFixed(4)} ${to}`,
        },
      };

    } catch (error) {
      console.error('Currency conversion error:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Unable to convert currency: ${errorMessage}`,
      };
    }
  },
});