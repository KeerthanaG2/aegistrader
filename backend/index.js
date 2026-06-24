import express from "express";
import { CdpClient } from "@coinbase/cdp-sdk";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";
import { runCycle } from "./agent.js";
import { getPortfolioState, getDrawdownPct, updateSettings } from "./risk.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, ".env") });

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;

// Get current portfolio + trade log
app.get("/api/portfolio", (req, res) => {
  const state = getPortfolioState();
  res.json({
    ...state,
    drawdownPct: getDrawdownPct(),
  });
});

// Get just the trade history
app.get("/api/trades", (req, res) => {
  const state = getPortfolioState();
  res.json(state.tradeLog);
});

let cycleRunning = false;

// Manually trigger a cycle (useful for demo — "run agent now" button)
app.post("/api/run-cycle", async (req, res) => {
  if (cycleRunning) {
    return res.status(429).json({ error: "A cycle is already running. Please wait." });
  }
  cycleRunning = true;
  try {
    const result = await runCycle();
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    cycleRunning = false;
  }
});

// Get current risk settings
app.get("/api/settings", (req, res) => {
  const state = getPortfolioState();
  res.json(state.settings);
});

// Update risk settings — user sets their own guardrails
app.post("/api/settings", (req, res) => {
  const { maxDrawdownPct, maxTradePct, minConfidence } = req.body;

  const updates = {};
  if (maxDrawdownPct !== undefined) {
    if (maxDrawdownPct < 5 || maxDrawdownPct > 50) {
      return res.status(400).json({ error: "maxDrawdownPct must be between 5 and 50." });
    }
    updates.maxDrawdownPct = maxDrawdownPct;
  }
  if (maxTradePct !== undefined) {
    if (maxTradePct < 1 || maxTradePct > 25) {
      return res.status(400).json({ error: "maxTradePct must be between 1 and 25." });
    }
    updates.maxTradePct = maxTradePct;
  }
  if (minConfidence !== undefined) {
    if (minConfidence < 0 || minConfidence > 100) {
      return res.status(400).json({ error: "minConfidence must be between 0 and 100." });
    }
    updates.minConfidence = minConfidence;
  }

  const merged = updateSettings(updates);
  res.json(merged);
});

// Get wallet details and cleanly handle SDK BigInt formatting
app.get("/api/wallet", async (req, res) => {
  try {
    const cdp = new CdpClient({
      apiKeyId: process.env.CDP_API_KEY_ID,
      apiKeySecret: process.env.CDP_API_KEY_SECRET,
      walletSecret: process.env.CDP_WALLET_SECRET,
    });
    const account = await cdp.evm.getOrCreateAccount({ name: "aegis-agent-wallet" });
    const balances = await cdp.evm.listTokenBalances({
      address: account.address,
      network: "base-sepolia",
    });
    
    const ethBalance = balances.balances?.find(b => b.token?.symbol === "ETH");
    
    // 🛡️ Safe Extraction: Dig out the raw amount & decimal values safely
    let formattedBalance = "0";
    if (ethBalance && ethBalance.amount) {
      const rawAmount = typeof ethBalance.amount === "object" ? ethBalance.amount.amount : ethBalance.amount;
      const decimals = typeof ethBalance.amount === "object" ? (ethBalance.amount.decimals || 18) : 18;
      
      if (rawAmount !== undefined && rawAmount !== null) {
        const bigintVal = typeof rawAmount === "bigint" ? rawAmount : BigInt(rawAmount.toString());
        
        // Convert the BigInt into a readable decimal format (e.g., 0.0573)
        const base = 10n ** BigInt(decimals);
        const integerPart = bigintVal / base;
        const remainder = bigintVal % base;
        let remainderStr = remainder.toString().padStart(decimals, "0").replace(/0+$/, "");
        
        formattedBalance = remainderStr ? `${integerPart}.${remainderStr}` : integerPart.toString();
      }
    }

    res.json({
      address: account.address,
      network: "base-sepolia",
      ethBalance: formattedBalance,
      explorerUrl: `https://sepolia.basescan.org/address/${account.address}`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 AegisTrader API running on http://localhost:${PORT}`);
});