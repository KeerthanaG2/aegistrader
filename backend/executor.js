import path from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";
import { CdpClient } from "@coinbase/cdp-sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, ".env") });

const cdp = new CdpClient({
  apiKeyId: process.env.CDP_API_KEY_ID,
  apiKeySecret: process.env.CDP_API_KEY_SECRET,
  walletSecret: process.env.CDP_WALLET_SECRET,
});

// A fixed "settlement" address representing where trade proofs get sent.
// For now, the agent sends a tiny tx to itself with the decision encoded as data.
function encodeDecisionAsHex(decision) {
  const json = JSON.stringify({
    action: decision.action,
    token: decision.token,
    amount_pct: decision.amount_pct,
    confidence: decision.confidence,
    ts: Date.now(),
  });
  return "0x" + Buffer.from(json, "utf8").toString("hex");
}

export async function executeOnChain(decision) {
  const account = await cdp.evm.getOrCreateAccount({ name: "aegis-agent-wallet" });

  // HOLD = no transaction needed, just log it
  if (decision.action === "HOLD") {
    return { executed: false, reason: "HOLD — no on-chain action taken." };
  }

  const data = encodeDecisionAsHex(decision);

  const tx = await cdp.evm.sendTransaction({
    address: account.address,
    network: "base-sepolia",
    transaction: {
      to: account.address,       // self-send, this is a settlement/proof tx
      value: 0n,
      data,
    },
  });

  return {
    executed: true,
    txHash: tx.transactionHash,
    explorerUrl: `https://sepolia.basescan.org/tx/${tx.transactionHash}`,
    decision,
  };
}

// run directly for testing
if (process.argv[1] && process.argv[1].endsWith("executor.js")) {
  const testDecision = {
    action: "BUY",
    token: "AERO",
    amount_pct: 5,
    confidence: 65,
    reason: "test run",
  };
  const result = await executeOnChain(testDecision);
  console.log(JSON.stringify(result, null, 2));
}