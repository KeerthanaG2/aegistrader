# AegisTrader

An autonomous, self-custodial AI trading agent built on Base (Coinbase L2). AegisTrader monitors live crypto market signals, uses an LLM to make risk-aware trade decisions, enforces institutional-grade guardrails, and executes on-chain — all without a third party ever touching your keys.

> A project demonstrating the intersection of AI agents, DeFi, and production-grade risk management.

---

## What it does

Every cycle (configurable interval, default 15 min), AegisTrader:

1. **Fetches live signals** — Fear & Greed Index (Alternative.me) + price/volume data for Base-ecosystem tokens (CoinGecko)
2. **Asks the LLM** — Sends signals to Gemini with a strict system prompt defining trading rules
3. **Checks risk guardrails** — Circuit breaker at configurable max drawdown %, trade size cap, confidence threshold gate
4. **Executes on-chain** — If approved, signs and broadcasts a real transaction via Coinbase CDP SDK (self-custodial, no third-party co-signing)
5. **Logs everything** — Decision, risk check, tx hash, portfolio value — all persisted in SQLite

---

## Architecture

CoinGecko + Alternative.me

↓

signals.js (live market data)

↓

brain.js (Gemini LLM decision)

↓

risk.js (circuit breaker + guardrails)

↓

executor.js (CDP SDK → Base Sepolia tx)

↓

SQLite (persistent state)

↑

Express REST API ← Next.js Dashboard



---

## Key features

- **Self-custodial execution** — Agent wallet created and controlled via Coinbase CDP SDK. Private keys never leave the agent environment.
- **LLM-powered decisions** — Gemini 2.5 Flash analyses sentiment vs. price divergence signals and returns structured JSON decisions each cycle.
- **Real risk guardrails** — Configurable max drawdown circuit breaker, per-trade size cap, and confidence threshold — enforced in code, not just policy.
- **On-chain proof** — Every non-HOLD decision produces a verifiable Base Sepolia transaction hash, inspectable on BaseScan.
- **Alpha vs. hold tracking** — Live benchmark comparison: did the agent outperform simply buying and holding the same token?
- **Persistent state** — SQLite-backed portfolio state, trade log, and value history survive server restarts.
- **User-configurable rules** — Risk parameters (max drawdown %, trade size, confidence threshold) are adjustable via the dashboard without touching code.

---

## Tech stack

| Layer | Technology |
|---|---|
| Chain | Base Sepolia (Coinbase L2) |
| Wallet / signing | Coinbase CDP SDK (self-custodial) |
| LLM | Google Gemini 2.5 Flash Lite |
| Market data | CoinGecko API + Alternative.me Fear & Greed |
| Backend | Node.js + Express |
| Database | SQLite (better-sqlite3) |
| Frontend | Next.js 14 + Recharts |

---

## Running locally

### Prerequisites
- Node.js 18+
- API keys: Coinbase CDP (apiKeyId, apiKeySecret, walletSecret), Google Gemini

### Setup

```bash
git clone https://github.com/YOUR_USERNAME/aegistrader
cd aegistrader/backend
npm install
```

Create `backend/.env`:

```env
CDP_API_KEY_ID=your_key
CDP_API_KEY_SECRET=your_secret
CDP_WALLET_SECRET=your_wallet_secret
GEMINI_API_KEY=your_gemini_key
```

```bash
# Fund your agent wallet (testnet, free)
node wallet-setup.js

# Start the backend
node index.js

# In a new terminal, start the frontend
cd ../frontend
npm install
npm run dev
```

Open `http://localhost:3000`

---

## API endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/portfolio` | Full portfolio state, trade log, value history |
| GET | `/api/trades` | Trade history only |
| GET | `/api/wallet` | Agent wallet address + live balance |
| GET | `/api/settings` | Current risk guardrail settings |
| POST | `/api/settings` | Update risk rules |
| POST | `/api/run-cycle` | Manually trigger one agent cycle |

---

## Risk guardrails

| Guardrail | Default | Range | Behaviour |
|---|---|---|---|
| Max drawdown | 20% | 5–50% | Hard circuit breaker — forces exit to cash |
| Max trade size | 10% | 1–25% | Caps LLM requests that exceed limit |
| Min confidence | 40% | 0–100% | Blocks low-conviction signals |

---

## On-chain proof

Example verified transaction on Base Sepolia:
`https://sepolia.basescan.org/tx/0x3c656e90ddc9f29fa5a2e0a8c22dca6e3b9741eecd84a26bd219303d2621954a`

Each trade decision is encoded as calldata in the transaction, making the agent's reasoning permanently inspectable on-chain.

---

## Portfolio simulation

Capital is simulated ($1000 starting value) against real market prices — standard practice for testnet trading agents. All signals, LLM decisions, and on-chain transactions are fully live. The simulation tracks real P&L math against actual token price movements.

---

## What's next

- Mainnet deployment with real capital controls
- Multi-wallet / multi-user support
- Additional signal sources (funding rates, on-chain liquidity)
- Strategy backtesting against historical data

