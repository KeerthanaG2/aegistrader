import { getSignals } from "./signals.js";
import { decide } from "./brain.js";
import {
  checkRiskGuardrails,
  logTrade,
  getPortfolioState,
  markToMarket,
  applyTradeToPortfolio,
  getDrawdownPct,
  recordHistoryPoint,
  markBenchmarkToMarket,
  initBenchmarkIfNeeded
} from "./risk.js";
import { executeOnChain } from "./executor.js";

export async function runCycle() {
  console.log("=== AegisTrader Cycle Start ===\n");

  const signals = await getSignals();
  console.log("📊 Signals:", `Fear/Greed ${signals.sentiment.value} (${signals.sentiment.classification})`);

  // 1. Mark active position and benchmark to current market before deciding
  markToMarket(signals.markets);
  markBenchmarkToMarket(signals.markets);

  console.log(`📉 Current drawdown: ${getDrawdownPct().toFixed(2)}%`);

  // 2. Run the decision layer
  const decision = await decide(signals);
  console.log("\n🧠 Decision:", JSON.stringify(decision, null, 2));

  // 3. Evaluate risk rules
  const riskCheck = checkRiskGuardrails(decision);
  console.log("\n🛡️  Risk check:", JSON.stringify(riskCheck, null, 2));

  let finalDecision;
  let onChainResult = null;

  if (!riskCheck.allowed) {
    console.log(`\n⛔ BLOCKED — forced action: ${riskCheck.forceAction}`);
    finalDecision = { ...decision, action: riskCheck.forceAction === "HOLD" ? "HOLD" : "EXIT_TO_STABLE" };
  } else {
    finalDecision = riskCheck.adjustedDecision || decision;
  }

  // 4. Update internal positions state
  applyTradeToPortfolio(finalDecision, signals.markets);

  // 5. Initialize the buy-and-hold benchmark the first time the agent ever buys
  if (finalDecision.action === "BUY") {
    initBenchmarkIfNeeded(finalDecision.token, signals.markets);
  }

  // 6. Fire transaction if it's an active trade action
  if (finalDecision.action !== "HOLD") {
    console.log(`\n✅ Executing on-chain: ${finalDecision.action} ${finalDecision.token || ""}`);
    onChainResult = await executeOnChain(finalDecision);
    console.log("\n⛓️  On-chain result:", JSON.stringify(onChainResult, null, 2));
  } else {
    console.log("\n💤 HOLD — no on-chain action.");
  }

  // 7. Log the trade now that we know the tx hash (or null if HOLD)
  logTrade(decision, riskCheck, onChainResult?.txHash || null);

  // 8. Capture chart data snapshot at the end of the full cycle
  recordHistoryPoint();

  console.log("\n📈 Portfolio state:", JSON.stringify(getPortfolioState(), null, 2));
  console.log("\n=== Cycle End ===");

  return { signals, decision, riskCheck, finalDecision, onChainResult, portfolio: getPortfolioState() };
}

// Run directly if executed via terminal
if (process.argv[1] && process.argv[1].endsWith("agent.js")) {
  runCycle().catch(console.error);
}