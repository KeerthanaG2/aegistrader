import path from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";
import { CdpClient } from "@coinbase/cdp-sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, ".env") });

async function main() {
  const cdp = new CdpClient({
    apiKeyId: process.env.CDP_API_KEY_ID,
    apiKeySecret: process.env.CDP_API_KEY_SECRET,
    walletSecret: process.env.CDP_WALLET_SECRET,
  });

  // getOrCreateAccount reuses the wallet if it already exists with this name
  const account = await cdp.evm.getOrCreateAccount({ name: "aegis-agent-wallet" });
  console.log("Wallet address:", account.address);

  // Check current balance first — only request faucet if low
  const balances = await cdp.evm.listTokenBalances({
    address: account.address,
    network: "base-sepolia",
  });
  console.log(
    "Current balances:",
    JSON.stringify(
      balances,
      (_, value) => (typeof value === "bigint" ? value.toString() : value),
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});