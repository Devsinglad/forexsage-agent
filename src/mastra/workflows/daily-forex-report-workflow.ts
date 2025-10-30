// src/workflows/daily-forex-report-workflow.ts
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { config } from '../config/settings';

const dailyReportInputSchema = z.object({
  watchlist: z.array(z.object({
    source: z.string().describe('Source currency'),
    target: z.string().describe('Target currency'),
  })).describe('Currency pairs to monitor'),
});

const watchlistRateSchema = z.object({
  pair: z.string(),
  currentRate: z.number(),
  timestamp: z.string(),
});

const dailyTrendSchema = z.object({
  pair: z.string(),
  change: z.number(),
  changeFormatted: z.string(),
  trend: z.string(),
  volatility: z.number(),
  highest: z.number(),
  lowest: z.number(),
});

// Step 1: Fetch current rates for watchlist
const fetchWatchlistRates = createStep({
  id: 'fetch-watchlist-rates',
  description: 'Fetches current rates for all pairs in watchlist',
  inputSchema: dailyReportInputSchema,
  outputSchema: z.object({
    watchlistRates: z.array(watchlistRateSchema),
    watchlist: z.array(z.object({
      source: z.string(),
      target: z.string(),
    })),
  }),
  execute: async ({ inputData }) => {
    const { watchlist } = inputData;
    
    console.log(`📊 Daily Report: Fetching rates for ${watchlist.length} pairs`);
    
    const apiKey = config.currencyKey;
    const watchlistRates: Array<{ pair: string; currentRate: number; timestamp: string }> = [];
    
    for (const pair of watchlist) {
      try {
        const response = await fetch(
          `https://api.currencylayer.com/live?access_key=${apiKey}&currencies=${pair.target}&source=${pair.source}&format=1`
        );
        
        if (!response.ok) continue;
        
        const data = await response.json();
        
        if (data.success && data.quotes) {
          const quoteKey = `${pair.source}${pair.target}`;
          const rate = data.quotes[quoteKey];
          
          watchlistRates.push({
            pair: `${pair.source}/${pair.target}`,
            currentRate: rate,
            timestamp: new Date(data.timestamp * 1000).toISOString(),
          });
        }
        
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Error fetching ${pair.source}/${pair.target}:`, error);
      }
    }
    
    return {
      watchlistRates,
      watchlist,
    };
  },
});

// Step 2: Get 7-day trends for context
const fetch7DayContext = createStep({
  id: 'fetch-7day-context',
  description: 'Fetches 7-day trends for all watchlist pairs',
  inputSchema: z.object({
    watchlistRates: z.array(watchlistRateSchema),
    watchlist: z.array(z.object({
      source: z.string(),
      target: z.string(),
    })),
  }),
  outputSchema: z.object({
    weeklyTrends: z.array(dailyTrendSchema),
  }),
  execute: async ({ inputData }) => {
    const { watchlist } = inputData;
    
    console.log(`📈 Daily Report: Analyzing 7-day trends`);
    
    const apiKey = config.currencyKey;
    const dates = calculateDatesForPeriod('7days');
    const weeklyTrends: any[] = [];
    
    for (const pair of watchlist) {
      const historicalData: Array<{ date: string; rate: number }> = [];
      
      for (const date of dates) {
        try {
          const response = await fetch(
            `https://api.currencylayer.com/historical?access_key=${apiKey}&date=${date}&currencies=${pair.target}&source=${pair.source}&format=1`
          );
          
          const data = await response.json();
          
          if (data.success && data.quotes) {
            const quoteKey = `${pair.source}${pair.target}`;
            if (data.quotes[quoteKey]) {
              historicalData.push({
                date: data.date,
                rate: data.quotes[quoteKey],
              });
            }
          }
          
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`Error fetching historical data:`, error);
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
        
        weeklyTrends.push({
          pair: `${pair.source}/${pair.target}`,
          change,
          changeFormatted: `${change > 0 ? '+' : ''}${change.toFixed(2)}%`,
          trend: change > 0 ? 'upward' : change < 0 ? 'downward' : 'stable',
          volatility,
          highest,
          lowest,
        });
      }
    }
    
    return { weeklyTrends };
  },
});

// Step 3: Identify notable changes and alerts
const identifyNotableChanges = createStep({
  id: 'identify-notable-changes',
  description: 'Identifies significant changes and high volatility',
  inputSchema: z.object({
    weeklyTrends: z.array(dailyTrendSchema),
  }),
  outputSchema: z.object({
    notableChanges: z.array(dailyTrendSchema),
    highVolatility: z.array(dailyTrendSchema),
    alerts: z.object({
      hasNotableChanges: z.boolean(),
      hasHighVolatility: z.boolean(),
    }),
  }),
  execute: async ({ inputData }) => {
    console.log(`🔍 Daily Report: Identifying notable changes`);
    
    const { weeklyTrends } = inputData;
    
    // Notable if change > 2%
    const notableChanges = weeklyTrends.filter(trend => 
      Math.abs(trend.change) > 2
    );
    
    // High volatility if > 50
    const highVolatility = weeklyTrends.filter(trend => 
      trend.volatility > 50
    );
    
    return {
      notableChanges,
      highVolatility,
      alerts: {
        hasNotableChanges: notableChanges.length > 0,
        hasHighVolatility: highVolatility.length > 0,
      },
    };
  },
});

// Step 4: Generate daily summary with AI
const generateDailySummary = createStep({
  id: 'generate-daily-summary',
  description: 'Generates AI-powered daily forex summary',
  inputSchema: z.object({
    watchlistRates: z.array(watchlistRateSchema),
    weeklyTrends: z.array(dailyTrendSchema),
    notableChanges: z.array(dailyTrendSchema),
    highVolatility: z.array(dailyTrendSchema),
    alerts: z.object({
      hasNotableChanges: z.boolean(),
      hasHighVolatility: z.boolean(),
    }),
  }),
  outputSchema: z.object({
    dailyReport: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    console.log(`📝 Daily Report: Generating AI summary`);
    
    const { watchlistRates, weeklyTrends, notableChanges, highVolatility, alerts } = inputData;
    
    const agent = mastra?.getAgent('forexSageAgent');
    if (!agent) {
      throw new Error('ForexSage agent not found');
    }
    
    const today = new Date().toISOString().split('T')[0];
    
    const prompt = `Generate a professional daily forex market report for ${today}.

**CURRENT RATES (as of today)**
${watchlistRates.map(r => `${r.pair}: ${r.currentRate.toFixed(4)}`).join('\n')}

**7-DAY PERFORMANCE**
${weeklyTrends.map(t => `${t.pair}: ${t.changeFormatted} (${t.trend}, volatility: ${t.volatility.toFixed(2)})`).join('\n')}

${alerts.hasNotableChanges ? `
**⚠️ NOTABLE CHANGES (>2%)**
${notableChanges.map(c => `${c.pair}: ${c.changeFormatted}`).join('\n')}
` : ''}

${alerts.hasHighVolatility ? `
**📊 HIGH VOLATILITY ALERT**
${highVolatility.map(v => `${v.pair}: Volatility ${v.volatility.toFixed(2)}`).join('\n')}
` : ''}

Please provide a concise daily summary with:

📊 **MARKET OVERVIEW**
- Brief summary of overall market sentiment
- Key movements in the past 24 hours

📈 **TOP PERFORMERS**
- Best and worst performing pairs

⚠️ **ALERTS & NOTABLE CHANGES**
- Any significant movements or volatility
- Pairs requiring attention

🔮 **OUTLOOK FOR TOMORROW**
- What to watch for
- Potential market movers

Keep it professional, concise, and actionable. Use bullet points and clear formatting.`;

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

    return { dailyReport: reportText };
  },
});

// Helper functions
function calculateDatesForPeriod(period: string): string[] {
  const dates: string[] = [];
  const today = new Date();
  
  const daysBack = 7;
  const interval = 1;
  
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
export const dailyForexReportWorkflow = createWorkflow({
  id: 'daily-forex-report',
  inputSchema: dailyReportInputSchema,
  outputSchema: z.object({
    dailyReport: z.string(),
  }),
})
  .then(fetchWatchlistRates)
  .then(fetch7DayContext)
  .then(identifyNotableChanges)
  .then(generateDailySummary);

dailyForexReportWorkflow.commit();