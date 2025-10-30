
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { completeForexAnalysisWorkflow, } from './workflows/complete-forex-analysis-workflow';
import { multiCurrencyComparisonWorkflow } from './workflows/multi-currency-comparison-workflow';
import { dailyForexReportWorkflow } from './workflows/daily-forex-report-workflow';
import { arbitrageOpportunityWorkflow } from './workflows/arbitrage-opportunity-workflow';
import { forexSageAgent } from './agents/forex-sage-agent';

export const mastra = new Mastra({
  workflows: {
    completeForexAnalysisWorkflow,
    multiCurrencyComparisonWorkflow,
    dailyForexReportWorkflow,
    arbitrageOpportunityWorkflow,
  },
  agents: { forexSageAgent },
  // scorers: { toolCallAppropriatenessScorer, completenessScorer, translationScorer },
  storage: new LibSQLStore({
    // stores observability, scores, ... into memory storage, if it needs to persist, change to file:../mastra.db
    url: ":memory:",
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
  telemetry: {
    // Telemetry is deprecated and will be removed in the Nov 4th release
    enabled: false,
  },
  observability: {
    // Enables DefaultExporter and CloudExporter for AI tracing
    default: { enabled: true },
  },
});
