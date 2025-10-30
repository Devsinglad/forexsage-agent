# ForexSage 💱🤖

> **Intelligent Currency Exchange Rate Analysis Agent with Real-Time Rates, Historical Trends, and AI-Powered Projections**

ForexSage is an AI-powered forex analysis agent built on Mastra that provides comprehensive currency exchange analysis, real-time rates, historical trends, and 2-year AI-powered projections through both conversational AI and automated workflows.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Mastra](https://img.shields.io/badge/Built%20with-Mastra-blue)](https://mastra.ai)
[![A2A Protocol](https://img.shields.io/badge/A2A-Compatible-green)](https://github.com/anthropics/a2a-spec)

---

## Features

### Conversational AI Agent
- **Real-Time Exchange Rates** - Get current rates for any currency pair
- **Historical Analysis** - Analyze trends over 7 days to 2 years
- **Currency Conversion** - Convert amounts between any currencies
- **Market Insights** - Volatility analysis and trend identification
- **AI Projections** - 2-year forecasts with multiple scenarios

### Automated Workflows

#### 1. **Complete Forex Analysis**
Full comprehensive analysis including:
- Current exchange rates
- 30-day trends
- 1-year performance
- 2-year historical data
- AI-powered projections (conservative, moderate, optimistic)

#### 2. **Multi-Currency Comparison**
Compare multiple currency pairs simultaneously:
- Performance rankings
- Volatility analysis
- Best/worst performers
- AI-generated insights

#### 3. **Daily Forex Report**
Automated daily monitoring with:
- Current rates for watchlist
- 7-day performance summary
- Notable change alerts
- High volatility warnings

#### 4. **Arbitrage Opportunity Detection**
Detect triangular arbitrage opportunities:
- Cross-currency analysis
- Profit potential calculations
- Risk assessment
- Practical feasibility

### A2A Protocol Support
Full Agent-to-Agent (A2A) protocol compliance for seamless integration with:
- Telex workflows
- Other A2A-compatible platforms
- Multi-agent systems

---

## Quick Start

### Prerequisites

- Node.js >= 20.9.0
- npm or yarn
- Currency Layer API key (free tier available)

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/Devsinglad/forexsage-agent.git
cd forexsage-agent
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**

Create a `.env` file in the project root:

```bash
# Required
OPENROUTER_API_KEY=your_openrouter_api_key_here
CURRENCYLAYER_API_KEY=your_currencylayer_api_key_here

# Optional (for persistent memory)
TURSO_DATABASE_URL=your_turso_database_url
TURSO_AUTH_TOKEN=your_turso_auth_token
```

**Getting API Keys:**
- **OpenRouter**: Sign up at [openrouter.ai](https://openrouter.ai) (Free tier: 2,000 requests/month)
- **Currency Layer**: Sign up at [currencylayer.com](https://currencylayer.com) (Free tier: 100 requests/month)
- **Turso** (Optional): Sign up at [turso.tech](https://turso.tech) for cloud database

4. **Start the development server**
```bash
npm run dev
```

The server will start at `http://localhost:4111`

---

## Usage

### Conversational Agent

#### Example 1: Current Exchange Rate
```bash
curl -X POST http://localhost:4111/a2a/agent/forexSageAgent \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "forex-001",
    "method": "chat",
    "params": {
      "message": {
        "role": "user",
        "parts": [
          {
            "kind": "text",
            "text": "What is the current USD to NGN exchange rate?"
          }
        ]
      }
    }
  }'
```

#### Example 2: Historical Trends
```bash
# Ask about trends
"Show me the USD/EUR trend over the past year"
```

#### Example 3: Projections
```bash
# Request projections
"Give me a 2-year projection for GBP/USD with risk analysis"
```

### Workflows

#### Complete Forex Analysis
```bash
curl -X POST http://localhost:4111/a2a/workflow/complete-forex-analysis \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "workflow-001",
    "method": "execute",
    "params": {
      "triggerData": {
        "sourceCurrency": "USD",
        "targetCurrency": "NGN",
        "analysisDepth": "detailed"
      }
    }
  }'
```

**Analysis Depths:**
- `basic` - Current rate + 30-day trends
- `detailed` - Current rate + 30-day + 1-year trends + projections
- `comprehensive` - All data + 2-year historical + detailed projections

#### Multi-Currency Comparison
```bash
curl -X POST http://localhost:4111/a2a/workflow/multi-currency-comparison \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "workflow-002",
    "method": "execute",
    "params": {
      "triggerData": {
        "baseCurrency": "USD",
        "targetCurrencies": ["NGN", "EUR", "GBP", "JPY"],
        "period": "30days"
      }
    }
  }'
```

**Available Periods:** `7days`, `30days`, `90days`, `1year`

#### Daily Forex Report
```bash
curl -X POST http://localhost:4111/a2a/workflow/daily-forex-report \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "workflow-003",
    "method": "execute",
    "params": {
      "triggerData": {
        "watchlist": [
          { "source": "USD", "target": "NGN" },
          { "source": "EUR", "target": "USD" },
          { "source": "GBP", "target": "USD" }
        ]
      }
    }
  }'
```

#### Arbitrage Opportunity Detection
```bash
curl -X POST http://localhost:4111/a2a/workflow/arbitrage-opportunity \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "workflow-004",
    "method": "execute",
    "params": {
      "triggerData": {
        "currencies": ["USD", "EUR", "GBP", "NGN"],
        "minimumSpread": 0.5
      }
    }
  }'
```

---

## 🔌 API Endpoints

### Agent Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/a2a/agent/forexSageAgent` | POST | Conversational forex analysis |
| `/a2a/forexsage/discover` | GET | Discover available capabilities |

### Workflow Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/a2a/workflow/complete-forex-analysis` | POST | Full analysis with projections |
| `/a2a/workflow/multi-currency-comparison` | POST | Compare multiple pairs |
| `/a2a/workflow/daily-forex-report` | POST | Daily monitoring report |
| `/a2a/workflow/arbitrage-opportunity` | POST | Find arbitrage opportunities |

---

## 🏗️ Architecture

```
forexsage-agent/
├── src/
│   ├── agents/
│   │   └── forex-sage-agent.ts          # Main AI agent
│   ├── tools/
│   │   ├── live-exchange-rate-tool.ts   # Real-time rates
│   │   ├── historical-rate-tool.ts      # Historical data
│   │   ├── historical-trends-tool.ts    # Trend analysis
│   │   └── currency-converter-tool.ts   # Currency conversion
│   ├── workflows/
│   │   ├── complete-forex-analysis-workflow.ts
│   │   ├── multi-currency-comparison-workflow.ts
│   │   ├── daily-forex-report-workflow.ts
│   │   └── arbitrage-opportunity-workflow.ts
│   ├── api/
│   │   └── routes/
│   │       ├── forexsage-a2a-route.ts
│   │       ├── complete-forex-analysis-a2a-route.ts
│   │       ├── multi-currency-comparison-a2a-route.ts
│   │       ├── daily-forex-report-a2a-route.ts
│   │       ├── arbitrage-opportunity-a2a-route.ts
│   │       └── forexsage-discovery-route.ts
│   └── mastra/
│       └── index.ts                      # Mastra configuration
├── .env                                  # Environment variables
├── package.json
└── README.md
```

---

## 🧪 Testing

### Run Test Suite
```bash
npm run test:a2a
```

### Test Individual Endpoints

**Test Discovery:**
```bash
curl http://localhost:4111/a2a/forexsage/discover | jq
```

**Test Agent:**
```bash
curl -X POST http://localhost:4111/a2a/agent/forexSageAgent \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "test-001",
    "method": "chat",
    "params": {
      "message": {
        "role": "user",
        "parts": [{"kind": "text", "text": "Current USD/NGN rate?"}]
      }
    }
  }' | jq
```

---

## 🌐 Integration with Telex

ForexSage is fully compatible with Telex workflows. Here's a sample configuration:

```json
{
  "name": "ForexSage Workflow",
  "nodes": [
    {
      "id": "forexsage",
      "type": "a2a_agent",
      "name": "ForexSage",
      "url": "https://your-deployment.com/a2a/agent/forexSageAgent",
      "description": "AI-powered forex analysis"
    },
    {
      "id": "complete_analysis",
      "type": "a2a_workflow",
      "name": "Complete Forex Analysis",
      "url": "https://your-deployment.com/a2a/workflow/complete-forex-analysis"
    }
  ]
}
```

---

## 📊 Response Format (A2A Protocol)

All A2A endpoints return JSON-RPC 2.0 compliant responses:

### Success Response
```json
{
  "jsonrpc": "2.0",
  "id": "request-id",
  "result": {
    "id": "task-id",
    "contextId": "context-id",
    "status": {
      "state": "completed",
      "timestamp": "2025-10-31T12:00:00Z",
      "message": {
        "messageId": "msg-id",
        "role": "agent",
        "parts": [
          {
            "kind": "text",
            "text": "Analysis result..."
          }
        ],
        "kind": "message"
      }
    },
    "artifacts": [...],
    "history": [...],
    "kind": "task"
  }
}
```

### Error Response
```json
{
  "jsonrpc": "2.0",
  "id": "request-id",
  "error": {
    "code": -32602,
    "message": "Invalid params",
    "data": {
      "details": "sourceCurrency is required"
    }
  }
}
```

**Error Codes:**
- `-32700` - Parse error (Invalid JSON)
- `-32600` - Invalid Request (Wrong JSON-RPC format)
- `-32601` - Method not found
- `-32602` - Invalid params (Missing/wrong parameters)
- `-32603` - Internal error (Server error)

---

## 🚀 Deployment

### Deploy to Mastra Cloud

1. **Build the project**
```bash
npm run build
```

2. **Deploy via Mastra Cloud Dashboard**
   - Go to [mastra.ai/cloud](https://mastra.ai/cloud)
   - Connect your GitHub repository
   - Add environment variables
   - Deploy

3. **Set environment variables in dashboard:**
   - `OPENROUTER_API_KEY`
   - `CURRENCYLAYER_API_KEY`
   - `TURSO_DATABASE_URL` (optional)
   - `TURSO_AUTH_TOKEN` (optional)

```

---

##  Use Cases

### Financial Analysis
- Monitor currency pairs for trading
- Generate daily market reports
- Track portfolio exposure to forex risk

### Business Operations
- Real-time currency conversion for international transactions
- Historical trend analysis for pricing strategies
- Multi-currency comparison for treasury operations

### Research & Education
- Study forex market patterns
- Analyze currency volatility
- Learn about arbitrage opportunities

### Automated Trading Signals
- Daily alerts for significant movements
- Volatility warnings
- Trend identification

---

## ⚠️ Important Disclaimers

1. **Not Financial Advice**: ForexSage provides general information and analysis only. This is not financial advice. Always consult qualified financial professionals before making investment decisions.

2. **Exchange Rate Accuracy**: Rates are fetched from Currency Layer API and may have slight delays. Always verify rates with your financial institution before executing transactions.

3. **Projections Are Estimates**: AI-powered projections are based on historical data patterns and should not be used as the sole basis for financial decisions. Future performance is not guaranteed.

4. **Arbitrage Opportunities**: Calculated arbitrage opportunities are theoretical and may not account for transaction fees, slippage, bid-ask spreads, or execution time. Real-world arbitrage involves significant risks and costs.

5. **API Rate Limits**: Free tier API keys have limited requests per month. Monitor your usage to avoid service interruptions.

---

##  Development

### Project Structure

```typescript
// Main agent configuration
export const forexSageAgent = new Agent({
  name: 'ForexSage',
  instructions: `...`,
  model: 'openrouter/z-ai/glm-4.6',
  tools: {
    liveExchangeRateTool,
    historicalTrendsTool,
    currencyConverterTool,
  },
  memory: new Memory({...}),
});
```

### Adding New Tools

1. Create tool in `src/tools/your-tool.ts`
2. Register with agent in `src/agents/forex-sage-agent.ts`
3. Update capabilities in discovery endpoint

### Adding New Workflows

1. Create workflow in `src/workflows/your-workflow.ts`
2. Create A2A route in `src/api/routes/your-workflow-a2a-route.ts`
3. Register in `src/mastra/index.ts`
4. Update discovery endpoint

---

## 📈 Roadmap

- [ ] Support for cryptocurrency pairs
- [ ] Email/SMS alerts for daily reports
- [ ] Web dashboard for visualization
- [ ] More granular projection intervals (quarterly)
- [ ] Integration with more forex data providers
- [ ] Real-time streaming updates via WebSocket
- [ ] Advanced technical indicators (RSI, MACD, etc.)
- [ ] Sentiment analysis from forex news


## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- Built with [Mastra](https://mastra.ai) - AI agent framework
- Powered by [Z.ai GLM-4.6](https://z.ai) - AI model
- Currency data from [Currency Layer API](https://currencylayer.com)
- A2A Protocol by [Anthropic](https://github.com/anthropics/a2a-spec)

---


## 🌟 Star Us!

If you find ForexSage useful, please consider giving it a ⭐ on GitHub!

