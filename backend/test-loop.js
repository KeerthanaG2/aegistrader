import { getSignals } from "./signals.js";
import { decide } from "./brain.js";
import { checkRiskGuardrails, logTrade, getPortfolioState } from "./risk.js";
import { executeOnChain } from "./executor.js";

async function runCycle() {
  console.log("=== AegisTrader Cycle Start ===\n");

  const signals = await getSignals();
  console.log("📊 Signals:", `Fear/Greed ${signals.sentiment.value} (${signals.sentiment.classification})`);

  const decision = await decide(signals);
  console.log("\n🧠 Decision:", JSON.stringify(decision, null, 2));

  const riskCheck = checkRiskGuardrails(decision);
  console.log("\n🛡️  Risk check:", JSON.stringify(riskCheck, null, 2));

  logTrade(decision, riskCheck);

  if (!riskCheck.allowed) {
    console.log(`\n⛔ BLOCKED — forced action: ${riskCheck.forceAction}`);
    return;
  }

  const finalDecision = riskCheck.adjustedDecision || decision;

  if (finalDecision.action === "HOLD") {
    console.log("\n💤 HOLD — no on-chain action.");
    return;
  }

  console.log(`\n✅ APPROVED — executing on-chain: ${finalDecision.action} ${finalDecision.token} (${finalDecision.amount_pct}%)`);
  const result = await executeOnChain(finalDecision);
  console.log("\n⛓️  On-chain result:", JSON.stringify(result, null, 2));

  console.log("\n=== Cycle End ===");
}

runCycle().catch(console.error);