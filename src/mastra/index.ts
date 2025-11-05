
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { completeForexAnalysisWorkflow, } from './workflows/complete-forex-analysis-workflow';
import { multiCurrencyComparisonWorkflow } from './workflows/multi-currency-comparison-workflow';
import { dailyForexReportWorkflow } from './workflows/daily-forex-report-workflow';
import { arbitrageOpportunityWorkflow } from './workflows/arbitrage-opportunity-workflow';
import { forexSageAgent } from './agents/forex-sage-agent';
import { a2aAgentRoute } from './api/routes/forexsage-a2a-route';
import { completeForexAnalysisA2ARoute } from './api/routes/complete-forex-analysis-a2a-route';
import { multiCurrencyComparisonA2ARoute } from './api/routes/multi-currency-comparison-a2a-route';
import { dailyForexReportA2ARoute } from './api/routes/daily-forex-report-a2a-route';
import { arbitrageOpportunityA2ARoute } from './api/routes/arbitrage-opportunity-a2a-route';

export const mastra = new Mastra({
  workflows: {
    completeForexAnalysisWorkflow,
    multiCurrencyComparisonWorkflow,
    dailyForexReportWorkflow,
    arbitrageOpportunityWorkflow,
  },
  agents: { forexSageAgent },
  storage: new LibSQLStore({
    // stores observability, scores, ... into memory storage, if it needs to persist, change to file:../mastra.db
    url: ":memory:",
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
  observability: {
    // Enables DefaultExporter and CloudExporter for AI tracing
    default: { enabled: true },
  },
  server: {
    build: {
      openAPIDocs: true,
      swaggerUI: true,
    },
    apiRoutes: [
      a2aAgentRoute,
      completeForexAnalysisA2ARoute,
      multiCurrencyComparisonA2ARoute,
      dailyForexReportA2ARoute,
      arbitrageOpportunityA2ARoute,
    ]
  }
});
