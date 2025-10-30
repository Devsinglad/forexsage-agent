// src/workflows/arbitrage-opportunity-workflow.ts
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { config } from '../config/settings';

const arbitrageInputSchema = z.object({
  currencies: z.array(z.string()).describe('Currencies to check (e.g., [USD, EUR, GBP, NGN])'),
  minimumSpread: z.number().default(0.5).describe('Minimum profitable spread %'),
});

const arbitrageOpportunitySchema = z.object({
  path: z.string(),
  rates: z.record(z.string(), z.number()),
  spread: z.number(),
  spreadFormatted: z.string(),
  profit: z.number(),
  profitFormatted: z.string(),
});

// Type definitions for better type safety
type ExchangeRates = Record<string, Record<string, number>>;

// Step 1: Fetch all exchange rates
const fetchAllExchangeRates = createStep({
  id: 'fetch-all-exchange-rates',
  description: 'Fetches exchange rates for all currency combinations',
  inputSchema: arbitrageInputSchema,
  outputSchema: z.object({
    allRates: z.custom<ExchangeRates>(),
    currencies: z.array(z.string()),
    minimumSpread: z.number(),
  }),
  execute: async ({ inputData }) => {
    const { currencies, minimumSpread } = inputData;
    
    console.log(`💹 Arbitrage: Fetching rates for ${currencies.length} currencies`);
    
    const apiKey = config.currencyKey;
    const allRates: Record<string, Record<string, number>> = {};
    
    // Get rates from each currency to all others
    for (const source of currencies) {
      const targets = currencies.filter(c => c !== source);
      
      try {
        const response = await fetch(
          `https://api.currencylayer.com/live?access_key=${apiKey}&currencies=${targets.join(',')}&source=${source}&format=1`
        );
        
        if (!response.ok) continue;
        
        const data = await response.json();
        
        if (data.success && data.quotes) {
          allRates[source] = {};
          
          Object.keys(data.quotes).forEach(key => {
            const targetCurrency = key.replace(source, '');
            allRates[source][targetCurrency] = data.quotes[key];
          });
        }
        
        await new Promise(resolve => setTimeout(resolve, 150));
      } catch (error) {
        console.error(`Error fetching rates for ${source}:`, error);
      }
    }
    
    return {
      allRates,
      currencies,
      minimumSpread,
    };
  },
});

// Step 2: Calculate triangular arbitrage opportunities
const calculateArbitrageOpportunities = createStep({
  id: 'calculate-arbitrage',
  description: 'Calculates triangular arbitrage opportunities',
  inputSchema: z.object({
    allRates: z.custom<ExchangeRates>(),
    currencies: z.array(z.string()),
    minimumSpread: z.number(),
  }),
  outputSchema: z.object({
    opportunities: z.array(arbitrageOpportunitySchema),
    totalFound: z.number(),
  }),
  execute: async ({ inputData }) => {
    console.log(`🔍 Arbitrage: Calculating triangular arbitrage opportunities`);
    
    const { allRates, currencies, minimumSpread } = inputData;
    const opportunities: any[] = [];
    
    // Check all possible triangular paths
    for (let i = 0; i < currencies.length; i++) {
      for (let j = 0; j < currencies.length; j++) {
        for (let k = 0; k < currencies.length; k++) {
          if (i !== j && j !== k && i !== k) {
            const currA = currencies[i];
            const currB = currencies[j];
            const currC = currencies[k];
            
            // Get rates
            const rateAB = allRates[currA]?.[currB];
            const rateBC = allRates[currB]?.[currC];
            const rateCA = allRates[currC]?.[currA];
            
            if (rateAB && rateBC && rateCA) {
              // Calculate final amount after conversion loop
              const finalAmount = 1 * rateAB * rateBC * rateCA;
              const spread = (finalAmount - 1) * 100;
              
              if (spread > minimumSpread) {
                opportunities.push({
                  path: `${currA} → ${currB} → ${currC} → ${currA}`,
                  rates: {
                    [`${currA}→${currB}`]: rateAB,
                    [`${currB}→${currC}`]: rateBC,
                    [`${currC}→${currA}`]: rateCA,
                  },
                  spread: spread,
                  spreadFormatted: `${spread.toFixed(4)}%`,
                  profit: finalAmount - 1,
                  profitFormatted: `${((finalAmount - 1) * 100).toFixed(4)}%`,
                });
              }
            }
          }
        }
      }
    }
    
    // Sort by spread (highest first)
    opportunities.sort((a, b) => b.spread - a.spread);
    
    return {
      opportunities: opportunities.slice(0, 10), // Top 10
      totalFound: opportunities.length,
    };
  },
});

// Step 3: Generate arbitrage analysis report
const generateArbitrageReport = createStep({
  id: 'generate-arbitrage-report',
  description: 'Generates detailed arbitrage analysis report',
  inputSchema: z.object({
    opportunities: z.array(arbitrageOpportunitySchema),
    totalFound: z.number(),
    currencies: z.array(z.string()),
    minimumSpread: z.number(),
  }),
  outputSchema: z.object({
    report: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    console.log(`📊 Arbitrage: Generating analysis report`);
    
    const { opportunities, totalFound, currencies, minimumSpread } = inputData;
    
    const agent = mastra?.getAgent('forexSageAgent');
    if (!agent) {
      throw new Error('ForexSage agent not found');
    }
    
    if (opportunities.length === 0) {
      return {
        report: `## Arbitrage Opportunity Analysis

**Currencies Analyzed:** ${currencies.join(', ')}
**Minimum Spread Threshold:** ${minimumSpread}%
**Date:** ${new Date().toISOString().split('T')[0]}

**RESULT:** No arbitrage opportunities found above the ${minimumSpread}% threshold.

This suggests that the forex market is currently efficient for these currency pairs, with no significant pricing discrepancies to exploit.

⚠️ **Note:** Arbitrage opportunities are rare in modern, efficient forex markets and typically exist only for very short periods.`,
      };
    }
    
    const prompt = `Generate a detailed arbitrage opportunity analysis report.

**ANALYSIS PARAMETERS**
- Currencies: ${currencies.join(', ')}
- Minimum Spread: ${minimumSpread}%
- Total Opportunities Found: ${totalFound}
- Date: ${new Date().toISOString().split('T')[0]}

**TOP ARBITRAGE OPPORTUNITIES**
${opportunities.map((opp, i) => `
${i + 1}. ${opp.path}
   - Spread: ${opp.spreadFormatted}
   - Profit: ${opp.profitFormatted}
   - Rates: ${Object.entries(opp.rates).map(([k, v]) => `${k}: ${v.toFixed(4)}`).join(', ')}
`).join('\n')}

Please provide:

1. **EXECUTIVE SUMMARY**
   - Overview of opportunities found
   - Market efficiency assessment

2. **TOP 3 OPPORTUNITIES BREAKDOWN**
   - Detailed analysis of the best opportunities
   - Step-by-step conversion path
   - Potential profit calculation

3. **RISK FACTORS**
   - Transaction costs and spreads
   - Execution speed requirements
   - Market liquidity considerations
   - Slippage risks

4. **PRACTICAL CONSIDERATIONS**
   - Minimum capital required
   - Execution complexity
   - Time sensitivity
   - Real-world feasibility

5. **RECOMMENDATIONS**
   - Which opportunities are most viable
   - Key factors to monitor
   - Risk mitigation strategies

**IMPORTANT:** Emphasize that these are theoretical opportunities and may not be profitable after accounting for real-world factors like transaction fees, bid-ask spreads, and execution time.

Format professionally with clear headers and bullet points.`;

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

// Create and commit workflow
export const arbitrageOpportunityWorkflow = createWorkflow({
  id: 'arbitrage-opportunity',
  inputSchema: arbitrageInputSchema,
  outputSchema: z.object({
    report: z.string(),
  }),
})
  .then(fetchAllExchangeRates)
  .then(calculateArbitrageOpportunities)
  .then(generateArbitrageReport);

arbitrageOpportunityWorkflow.commit();