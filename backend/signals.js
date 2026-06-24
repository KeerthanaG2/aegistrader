import path from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, ".env") });

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

const TRACKED_TOKENS = ["ethereum", "coinbase-wrapped-btc", "aerodrome-finance", "degen-base"];

async function getFearGreedIndex() {
  const res = await fetch("https://api.alternative.me/fng/?limit=1");
  const data = await res.json();
  const latest = data.data[0];
  return {
    value: Number(latest.value),
    classification: latest.value_classification,
    timestamp: latest.timestamp,
  };
}

async function getMarketData() {
  const ids = TRACKED_TOKENS.join(",");
  const url = `${COINGECKO_BASE}/coins/markets?vs_currency=usd&ids=${ids}&price_change_percentage=24h,7d`;
  const res = await fetch(url);
  const data = await res.json();

  return data.map(coin => ({
    id: coin.id,
    symbol: coin.symbol.toUpperCase(),
    price: coin.current_price,
    change_24h: coin.price_change_percentage_24h_in_currency,
    change_7d: coin.price_change_percentage_7d_in_currency,
    market_cap: coin.market_cap,
    volume_24h: coin.total_volume,
  }));
}

export async function getSignals() {
  const [sentiment, markets] = await Promise.all([
    getFearGreedIndex(),
    getMarketData(),
  ]);

  return { timestamp: new Date().toISOString(), sentiment, markets };
}

// Always run when called directly with `node signals.js`
// Only run this block when executing `node signals.js` directly
if (process.argv[1] && process.argv[1].endsWith("signals.js")) {
  try {
    const signals = await getSignals();
    console.log(JSON.stringify(signals, null, 2));
  } catch (error) {
    console.error("An error occurred while fetching signals directly:", error);
  }
}