// src/workflows/complete-forex-analysis-workflow.ts
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { config } from '../config/settings';


// Define schemas
const currencyPairSchema = z.object({
  sourceCurrency: z.string().describe('Source currency code (e.g., USD)'),
  targetCurrency: z.string().describe('Target currency code (e.g., NGN)'),
  analysisDepth: z.enum(['basic', 'detailed', 'comprehensive']).default('detailed'),
});

const currentRateSchema = z.object({
  source: z.string(),
  timestamp: z.string(),
  rates: z.record(z.string(), z.number()),
  formatted: z.array(z.object({
    pair: z.string(),
    rate: z.number(),
    formattedRate: z.string(),
  })),
});

const trendsSchema = z.object({
  pair: z.string(),
  period: z.string(),
  historicalData: z.array(z.object({
    date: z.string(),
    rate: z.number(),
  })),
  statistics: z.object({
    highest: z.object({
      rate: z.number(),
      date: z.string().optional(),
    }),
    lowest: z.object({
      rate: z.number(),
      date: z.string().optional(),
    }),
    average: z.number(),
    current: z.number(),
    change: z.number(),
    changeFormatted: z.string(),
    volatility: z.number(),
  }),
  trend: z.string(),
});

// Step 1: Fetch Current Exchange Rate
const fetchCurrentRate = createStep({
  id: 'fetch-current-rate',
  description: 'Fetches current exchange rate for currency pair',
  inputSchema: currencyPairSchema,
  outputSchema: z.object({
    currentRate: currentRateSchema,
    pair: z.string(),
    sourceCurrency: z.string(),
    targetCurrency: z.string(),
    analysisDepth: z.string(),
  }),
  execute: async ({ inputData }) => {
    const { sourceCurrency, targetCurrency, analysisDepth } = inputData;
    
    console.log(`📊 Step 1: Fetching current rate for ${sourceCurrency}/${targetCurrency}`);
    
    const apiKey = config.currencyKey;
    
    if (!apiKey) {
      throw new Error('CURRENCYLAYER_API_KEY is not configured');
    }
    
    const response = await fetch(
      `https://api.currencylayer.com/live?access_key=${apiKey}&currencies=${targetCurrency}&source=${sourceCurrency}&format=1`
    );
    
    if (!response.ok) {
      throw new Error(`Failed to fetch exchange rates: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error?.info || 'API error');
    }
    
    const rates: Record<string, number> = {};
    const timestamp = new Date(data.timestamp * 1000);
    
    Object.keys(data.quotes).forEach(key => {
      const targetCurr = key.replace(sourceCurrency, '');
      rates[targetCurr] = data.quotes[key];
    });
    
    const currentRate = {
      source: data.source,
      timestamp: timestamp.toISOString(),
      rates: rates,
      formatted: Object.keys(rates).map(currency => ({
        pair: `${sourceCurrency}/${currency}`,
        rate: rates[currency],
        formattedRate: `1 ${sourceCurrency} = ${rates[currency].toFixed(4)} ${currency}`,
      })),
    };
    
    return {
      currentRate,
      pair: `${sourceCurrency}/${targetCurrency}`,
      sourceCurrency,
      targetCurrency,
      analysisDepth,
    };
  },
});

// Step 2: Fetch 30-Day Historical Trends
const fetch30DayTrends = createStep({
  id: 'fetch-30day-trends',
  description: 'Fetches 30-day historical trends',
  inputSchema: z.object({
    currentRate: currentRateSchema,
    pair: z.string(),
    sourceCurrency: z.string(),
    targetCurrency: z.string(),
    analysisDepth: z.string(),
  }),
  outputSchema: z.object({
    currentRate: currentRateSchema,
    pair: z.string(),
    sourceCurrency: z.string(),
    targetCurrency: z.string(),
    analysisDepth: z.string(),
    trends30Days: trendsSchema,
  }),
  execute: async ({ inputData }) => {
    const { sourceCurrency, targetCurrency, analysisDepth } = inputData;
    
    console.log(`📈 Step 2: Analyzing 30-day trends for ${sourceCurrency}/${targetCurrency}`);
    
    const apiKey = config.currencyKey;
    
    if (!apiKey) {
      throw new Error('CURRENCYLAYER_API_KEY is not configured');
    }
    const dates = calculateDatesForPeriod('30days');
    const historicalData: Array<{ date: string; rate: number }> = [];
    
    for (const date of dates) {
      try {
        const response = await fetch(
          `https://api.currencylayer.com/historical?access_key=${apiKey}&date=${date}&currencies=${targetCurrency}&source=${sourceCurrency}&format=1`
        );
        
        const data = await response.json();
        
        if (data.success && data.quotes) {
          const quoteKey = `${sourceCurrency}${targetCurrency}`;
          if (data.quotes[quoteKey]) {
            historicalData.push({
              date: data.date,
              rate: data.quotes[quoteKey],
            });
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Error fetching data for ${date}:`, error);
      }
    }
    
    if (historicalData.length === 0) {
      throw new Error('No historical data available');
    }
    
    const rates = historicalData.map(d => d.rate);
    const highest = Math.max(...rates);
    const lowest = Math.min(...rates);
    const average = rates.reduce((a, b) => a + b, 0) / rates.length;
    const current = rates[rates.length - 1];
    const oldest = rates[0];
    const change = ((current - oldest) / oldest) * 100;
    const volatility = calculateVolatility(rates);
    
    const trends30Days = {
      pair: `${sourceCurrency}/${targetCurrency}`,
      period: '30days',
      historicalData,
      statistics: {
        highest: {
          rate: highest,
          date: historicalData.find(d => d.rate === highest)?.date,
        },
        lowest: {
          rate: lowest,
          date: historicalData.find(d => d.rate === lowest)?.date,
        },
        average,
        current,
        change,
        changeFormatted: `${change > 0 ? '+' : ''}${change.toFixed(2)}%`,
        volatility,
      },
      trend: change > 0 ? 'upward' : change < 0 ? 'downward' : 'stable',
    };
    
    return {
      currentRate: inputData.currentRate,
      pair: inputData.pair,
      sourceCurrency,
      targetCurrency,
      analysisDepth,
      trends30Days,
    };
  },
});

// Step 3: Fetch 1-Year Historical Trends
const fetch1YearTrends = createStep({
  id: 'fetch-1year-trends',
  description: 'Fetches 1-year historical trends',
  inputSchema: z.object({
    currentRate: currentRateSchema,
    pair: z.string(),
    sourceCurrency: z.string(),
    targetCurrency: z.string(),
    analysisDepth: z.string(),
    trends30Days: trendsSchema,
  }),
  outputSchema: z.object({
    currentRate: currentRateSchema,
    pair: z.string(),
    sourceCurrency: z.string(),
    targetCurrency: z.string(),
    analysisDepth: z.string(),
    trends30Days: trendsSchema,
    trends1Year: trendsSchema,
  }),
  execute: async ({ inputData }) => {
    const { sourceCurrency, targetCurrency, analysisDepth } = inputData;
    
    console.log(`📊 Step 3: Analyzing 1-year trends for ${sourceCurrency}/${targetCurrency}`);
    
    const apiKey = config.currencyKey;
    
    if (!apiKey) {
      throw new Error('CURRENCYLAYER_API_KEY is not configured');
    }
    const dates = calculateDatesForPeriod('1year');
    const historicalData: Array<{ date: string; rate: number }> = [];
    
    for (const date of dates) {
      try {
        const response = await fetch(
          `https://api.currencylayer.com/historical?access_key=${apiKey}&date=${date}&currencies=${targetCurrency}&source=${sourceCurrency}&format=1`
        );
        
        const data = await response.json();
        
        if (data.success && data.quotes) {
          const quoteKey = `${sourceCurrency}${targetCurrency}`;
          if (data.quotes[quoteKey]) {
            historicalData.push({
              date: data.date,
              rate: data.quotes[quoteKey],
            });
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, 150));
      } catch (error) {
        console.error(`Error fetching data for ${date}:`, error);
      }
    }
    
    if (historicalData.length === 0) {
      throw new Error('No 1-year historical data available');
    }
    
    const rates = historicalData.map(d => d.rate);
    const highest = Math.max(...rates);
    const lowest = Math.min(...rates);
    const average = rates.reduce((a, b) => a + b, 0) / rates.length;
    const current = rates[rates.length - 1];
    const oldest = rates[0];
    const change = ((current - oldest) / oldest) * 100;
    const volatility = calculateVolatility(rates);
    
    const trends1Year = {
      pair: `${sourceCurrency}/${targetCurrency}`,
      period: '1year',
      historicalData,
      statistics: {
        highest: {
          rate: highest,
          date: historicalData.find(d => d.rate === highest)?.date,
        },
        lowest: {
          rate: lowest,
          date: historicalData.find(d => d.rate === lowest)?.date,
        },
        average,
        current,
        change,
        changeFormatted: `${change > 0 ? '+' : ''}${change.toFixed(2)}%`,
        volatility,
      },
      trend: change > 0 ? 'upward' : change < 0 ? 'downward' : 'stable',
    };
    
    return {
      currentRate: inputData.currentRate,
      pair: inputData.pair,
      sourceCurrency,
      targetCurrency,
      analysisDepth,
      trends30Days: inputData.trends30Days,
      trends1Year,
    };
  },
});

// Step 4: Fetch 2-Year Historical Trends
const fetch2YearTrends = createStep({
  id: 'fetch-2year-trends',
  description: 'Fetches 2-year historical trends for projections',
  inputSchema: z.object({
    currentRate: currentRateSchema,
    pair: z.string(),
    sourceCurrency: z.string(),
    targetCurrency: z.string(),
    analysisDepth: z.string(),
    trends30Days: trendsSchema,
    trends1Year: trendsSchema,
  }),
  outputSchema: z.object({
    currentRate: currentRateSchema,
    pair: z.string(),
    sourceCurrency: z.string(),
    targetCurrency: z.string(),
    analysisDepth: z.string(),
    trends30Days: trendsSchema,
    trends1Year: trendsSchema,
    trends2Years: trendsSchema.nullable(),
  }),
  execute: async ({ inputData }) => {
    const { sourceCurrency, targetCurrency, analysisDepth } = inputData;
    
    if (analysisDepth === 'basic') {
      console.log(`⏭️ Step 4: Skipping 2-year trends (basic analysis)`);
      return {
        currentRate: inputData.currentRate,
        pair: inputData.pair,
        sourceCurrency,
        targetCurrency,
        analysisDepth,
        trends30Days: inputData.trends30Days,
        trends1Year: inputData.trends1Year,
        trends2Years: null,
      };
    }
    
    console.log(`📊 Step 4: Analyzing 2-year trends for ${sourceCurrency}/${targetCurrency}`);
    
    const apiKey = config.currencyKey;
    
    if (!apiKey) {
      throw new Error('CURRENCYLAYER_API_KEY is not configured');
    }
    const dates = calculateDatesForPeriod('2years');
    const historicalData: Array<{ date: string; rate: number }> = [];
    
    for (const date of dates) {
      try {
        const response = await fetch(
          `https://api.currencylayer.com/historical?access_key=${apiKey}&date=${date}&currencies=${targetCurrency}&source=${sourceCurrency}&format=1`
        );
        
        const data = await response.json();
        
        if (data.success && data.quotes) {
          const quoteKey = `${sourceCurrency}${targetCurrency}`;
          if (data.quotes[quoteKey]) {
            historicalData.push({
              date: data.date,
              rate: data.quotes[quoteKey],
            });
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, 150));
      } catch (error) {
        console.error(`Error fetching data for ${date}:`, error);
      }
    }
    
    if (historicalData.length === 0) {
      return {
        currentRate: inputData.currentRate,
        pair: inputData.pair,
        sourceCurrency,
        targetCurrency,
        analysisDepth,
        trends30Days: inputData.trends30Days,
        trends1Year: inputData.trends1Year,
        trends2Years: null,
      };
    }
    
    const rates = historicalData.map(d => d.rate);
    const highest = Math.max(...rates);
    const lowest = Math.min(...rates);
    const average = rates.reduce((a, b) => a + b, 0) / rates.length;
    const current = rates[rates.length - 1];
    const oldest = rates[0];
    const change = ((current - oldest) / oldest) * 100;
    const volatility = calculateVolatility(rates);
    
    const trends2Years = {
      pair: `${sourceCurrency}/${targetCurrency}`,
      period: '2years',
      historicalData,
      statistics: {
        highest: {
          rate: highest,
          date: historicalData.find(d => d.rate === highest)?.date,
        },
        lowest: {
          rate: lowest,
          date: historicalData.find(d => d.rate === lowest)?.date,
        },
        average,
        current,
        change,
        changeFormatted: `${change > 0 ? '+' : ''}${change.toFixed(2)}%`,
        volatility,
      },
      trend: change > 0 ? 'upward' : change < 0 ? 'downward' : 'stable',
    };
    
    return {
      currentRate: inputData.currentRate,
      pair: inputData.pair,
      sourceCurrency,
      targetCurrency,
      analysisDepth,
      trends30Days: inputData.trends30Days,
      trends1Year: inputData.trends1Year,
      trends2Years,
    };
  },
});

// Step 5: Generate AI Analysis and 2-Year Projections
const generateAIAnalysis = createStep({
  id: 'generate-ai-analysis',
  description: 'Generates AI-powered analysis and 2-year projections',
  inputSchema: z.object({
    currentRate: currentRateSchema,
    pair: z.string(),
    sourceCurrency: z.string(),
    targetCurrency: z.string(),
    analysisDepth: z.string(),
    trends30Days: trendsSchema,
    trends1Year: trendsSchema,
    trends2Years: trendsSchema.nullable(),
  }),
  outputSchema: z.object({
    aiAnalysis: z.string(),
    projections: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    console.log(`🤖 Step 5: Generating AI analysis and projections`);
    
    const { currentRate, trends30Days, trends1Year, trends2Years, sourceCurrency, targetCurrency } = inputData;
    
    if (!mastra) {
      throw new Error('Mastra instance is not available');
    }
    
    const agent = mastra.getAgent('forexSageAgent');
    if (!agent) {
      throw new Error('ForexSage agent not found. Make sure the agent is properly registered in the Mastra instance.');
    }
    
    const prompt = `Analyze the following forex data for ${sourceCurrency}/${targetCurrency} and provide a comprehensive report:

**CURRENT MARKET STATUS**
Current Rate: ${currentRate.formatted[0]?.formattedRate || 'N/A'}
Timestamp: ${currentRate.timestamp}

**30-DAY PERFORMANCE**
Change: ${trends30Days.statistics.changeFormatted}
Trend: ${trends30Days.trend}
Highest: ${trends30Days.statistics.highest.rate.toFixed(4)} (${trends30Days.statistics.highest.date})
Lowest: ${trends30Days.statistics.lowest.rate.toFixed(4)} (${trends30Days.statistics.lowest.date})
Volatility: ${trends30Days.statistics.volatility.toFixed(2)}

**1-YEAR PERFORMANCE**
Change: ${trends1Year.statistics.changeFormatted}
Trend: ${trends1Year.trend}
Average: ${trends1Year.statistics.average.toFixed(4)}
Volatility: ${trends1Year.statistics.volatility.toFixed(2)}

${trends2Years ? `**2-YEAR PERFORMANCE**
Change: ${trends2Years.statistics.changeFormatted}
Trend: ${trends2Years.trend}
Average: ${trends2Years.statistics.average.toFixed(4)}
Volatility: ${trends2Years.statistics.volatility.toFixed(2)}` : ''}

Please provide:

1. **MARKET ASSESSMENT** (Current state and momentum)
2. **KEY TRENDS & PATTERNS** (What the data reveals)
3. **2-YEAR PROJECTIONS** with three scenarios:
   
   **Conservative Scenario** (Lower bound):
   - 6 months: [range]
   - 1 year: [range]
   - 2 years: [range]
   
   **Moderate Scenario** (Most likely):
   - 6 months: [range]
   - 1 year: [range]
   - 2 years: [range]
   
   **Optimistic Scenario** (Upper bound):
   - 6 months: [range]
   - 1 year: [range]
   - 2 years: [range]

4. **RISK FACTORS** (Volatility assessment and key risks)
5. **KEY FACTORS TO MONITOR** (Economic indicators, events, policies)

Use the actual historical data to make realistic projections. Be specific with numbers.`;

    const response = await agent.stream([
      {
        role: 'user',
        content: prompt,
      },
    ]);

    let analysisText = '';

    for await (const chunk of response.textStream) {
      process.stdout.write(chunk);
      analysisText += chunk;
    }

    return {
      aiAnalysis: analysisText,
      projections: analysisText,
    };
  },
});

// Helper Functions
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
    case '2years':
      daysBack = 730;
      interval = 60;
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

// Create and commit the workflow
export const completeForexAnalysisWorkflow = createWorkflow({
  id: 'complete-forex-analysis',
  inputSchema: currencyPairSchema,
  outputSchema: z.object({
    aiAnalysis: z.string(),
    projections: z.string(),
  }),
})
  .then(fetchCurrentRate)
  .then(fetch30DayTrends)
  .then(fetch1YearTrends)
  .then(fetch2YearTrends)
  .then(generateAIAnalysis);

completeForexAnalysisWorkflow.commit();