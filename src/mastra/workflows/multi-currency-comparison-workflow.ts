// src/workflows/multi-currency-comparison-workflow.ts
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { config } from '../config/settings';

const multiCurrencyInputSchema = z.object({
  baseCurrency: z.string().describe('Base currency (e.g., USD)'),
  targetCurrencies: z.array(z.string()).describe('Target currencies (e.g., [NGN, EUR, GBP])'),
  period: z.enum(['7days', '30days', '90days', '1year']).default('30days'),
});

const currencyRateSchema = z.object({
  currency: z.string(),
  rate: z.number(),
  pair: z.string(),
});

const currencyComparisonSchema = z.object({
  currency: z.string(),
  pair: z.string(),
  currentRate: z.number(),
  change: z.number(),
  changeFormatted: z.string(),
  trend: z.string(),
  volatility: z.number(),
  highest: z.number(),
  lowest: z.number(),
});

// Step 1: Fetch all current rates
const fetchAllCurrentRates = createStep({
  id: 'fetch-all-current-rates',
  description: 'Fetches current exchange rates for all currency pairs',
  inputSchema: multiCurrencyInputSchema,
  outputSchema: z.object({
    currentRates: z.array(currencyRateSchema),
    baseCurrency: z.string(),
    targetCurrencies: z.array(z.string()),
    period: z.string(),
  }),
  execute: async ({ inputData }) => {
    const { baseCurrency, targetCurrencies, period } = inputData;
    
    console.log(`💱 Step 1: Fetching current rates for ${targetCurrencies.length} currency pairs`);
    
    const apiKey = config.currencyKey;
    const currencyList = targetCurrencies.join(',');
    
    const response = await fetch(
      `https://api.currencylayer.com/live?access_key=${apiKey}&currencies=${currencyList}&source=${baseCurrency}&format=1`
    );
    
    if (!response.ok) {
      throw new Error('Failed to fetch exchange rates');
    }
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error?.info || 'API error');
    }
    
    const currentRates: Array<{ currency: string; rate: number; pair: string }> = [];
    
    Object.keys(data.quotes).forEach(key => {
      const targetCurrency = key.replace(baseCurrency, '');
      currentRates.push({
        currency: targetCurrency,
        rate: data.quotes[key],
        pair: `${baseCurrency}/${targetCurrency}`,
      });
    });
    
    return {
      currentRates,
      baseCurrency,
      targetCurrencies,
      period,
    };
  },
});

// Step 2: Fetch historical trends for all currencies
const fetchHistoricalTrendsForAll = createStep({
  id: 'fetch-historical-trends-all',
  description: 'Fetches historical trends for all currency pairs',
  inputSchema: z.object({
    currentRates: z.array(currencyRateSchema),
    baseCurrency: z.string(),
    targetCurrencies: z.array(z.string()),
    period: z.string(),
  }),
  outputSchema: z.object({
    comparisons: z.array(currencyComparisonSchema),
  }),
  execute: async ({ inputData }) => {
    const { baseCurrency, targetCurrencies, period } = inputData;
    
    console.log(`📊 Step 2: Analyzing historical trends for all pairs`);
    
    const apiKey = config.currencyKey;
    const dates = calculateDatesForPeriod(period);
    const comparisons: any[] = [];
    
    for (const targetCurrency of targetCurrencies) {
      const historicalData: Array<{ date: string; rate: number }> = [];
      
      for (const date of dates) {
        try {
          const response = await fetch(
            `https://api.currencylayer.com/historical?access_key=${apiKey}&date=${date}&currencies=${targetCurrency}&source=${baseCurrency}&format=1`
          );
          
          const data = await response.json();
          
          if (data.success && data.quotes) {
            const quoteKey = `${baseCurrency}${targetCurrency}`;
            if (data.quotes[quoteKey]) {
              historicalData.push({
                date: data.date,
                rate: data.quotes[quoteKey],
              });
            }
          }
          
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`Error fetching ${targetCurrency} for ${date}:`, error);
        }
      }
      
      if (historicalData.length > 0) {
        const rates = historicalData.map(d => d.rate);
        const highest = Math.max(...rates);
        const lowest = Math.min(...rates);
        const current = rates[rates.length - 1];
        const oldest = rates[0];
        const change = ((current - oldest) / oldest) * 100;
        const volatility = calculateVolatility(rates);
        
        comparisons.push({
          currency: targetCurrency,
          pair: `${baseCurrency}/${targetCurrency}`,
          currentRate: current,
          change,
          changeFormatted: `${change > 0 ? '+' : ''}${change.toFixed(2)}%`,
          trend: change > 0 ? 'upward' : change < 0 ? 'downward' : 'stable',
          volatility,
          highest,
          lowest,
        });
      }
    }
    
    return { comparisons };
  },
});

// Step 3: Rank and generate comparison report
const generateComparisonReport = createStep({
  id: 'generate-comparison-report',
  description: 'Ranks currencies and generates comparison report',
  inputSchema: z.object({
    comparisons: z.array(currencyComparisonSchema),
    baseCurrency: z.string(),
    period: z.string(),
  }),
  outputSchema: z.object({
    report: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    console.log(`📝 Step 3: Generating comparison report`);
    
    const { comparisons, baseCurrency, period } = inputData;
    
    // Sort by performance
    const byPerformance = [...comparisons].sort((a, b) => b.change - a.change);
    const byVolatility = [...comparisons].sort((a, b) => b.volatility - a.volatility);
    
    const bestPerformer = byPerformance[0];
    const worstPerformer = byPerformance[byPerformance.length - 1];
    const mostVolatile = byVolatility[0];
    const leastVolatile = byVolatility[byVolatility.length - 1];
    
    const agent = mastra?.getAgent('forexSageAgent');
    if (!agent) {
      throw new Error('ForexSage agent not found');
    }
    
    const prompt = `Generate a comprehensive multi-currency comparison report for ${baseCurrency} against multiple currencies over ${period}.

**PERFORMANCE RANKINGS**
${byPerformance.map((c, i) => `${i + 1}. ${c.pair}: ${c.changeFormatted} (${c.trend})`).join('\n')}

**KEY INSIGHTS**
- Best Performer: ${bestPerformer.pair} (${bestPerformer.changeFormatted})
- Worst Performer: ${worstPerformer.pair} (${worstPerformer.changeFormatted})
- Most Volatile: ${mostVolatile.pair} (Volatility: ${mostVolatile.volatility.toFixed(2)})
- Least Volatile: ${leastVolatile.pair} (Volatility: ${leastVolatile.volatility.toFixed(2)})

**DETAILED COMPARISON DATA**
${comparisons.map(c => `
${c.pair}:
- Current Rate: ${c.currentRate.toFixed(4)}
- Change: ${c.changeFormatted}
- Trend: ${c.trend}
- Range: ${c.lowest.toFixed(4)} - ${c.highest.toFixed(4)}
- Volatility: ${c.volatility.toFixed(2)}
`).join('\n')}

Please provide:
1. Executive summary of currency performance
2. Analysis of trends and patterns
3. Recommendations for each currency pair
4. Risk assessment and volatility insights
5. Key factors driving performance differences

Format the response clearly with headers and bullet points.`;

    const response = await agent.stream([
      {
        role: 'user',
        content: prompt,
      },
    ]);

    let reportText = '';

    for await (const chunk of response.textStream) {
      process.stdout.write(chunk);
      reportText += chunk;
    }

    return { report: reportText };
  },
});

// Helper functions
function calculateDatesForPeriod(period: string): string[] {
  const dates: string[] = [];
  const today = new Date();
  
  let daysBack: number;
  let interval: number;
  
  switch (period) {
    case '7days':
      daysBack = 7;
      interval = 1;
      break;
    case '30days':
      daysBack = 30;
      interval = 3;
      break;
    case '90days':
      daysBack = 90;
      interval = 7;
      break;
    case '1year':
      daysBack = 365;
      interval = 30;
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

function calculateVolatility(rates: number[]): number {
  const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
  const squaredDiffs = rates.map(rate => Math.pow(rate - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / rates.length;
  return Math.sqrt(variance);
}

// Create and commit workflow
export const multiCurrencyComparisonWorkflow = createWorkflow({
  id: 'multi-currency-comparison',
  inputSchema: multiCurrencyInputSchema,
  outputSchema: z.object({
    report: z.string(),
  }),
})
  .then(fetchAllCurrentRates)
  .then(fetchHistoricalTrendsForAll)
  .then(generateComparisonReport);

multiCurrencyComparisonWorkflow.commit();