import path from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { getSignals } from "./signals.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, ".env") });

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SYSTEM_PROMPT = `
You are AegisTrader, an autonomous risk-aware crypto trading agent operating on Base. Your job: analyze market sentiment and price data, then decide ONE action.

Rules you MUST follow:
- If Fear & Greed index < 25 ("Extreme Fear") AND a token's 24h change is strongly positive (>8%), treat this as a potential reversal/divergence signal worth flagging — but be cautious, not aggressive.
- Never recommend an amount larger than 10% of a hypothetical portfolio per trade.
- If signals are ambiguous or conflicting, choose HOLD.
- This is a real testnet simulation for a hackathon project — your decisions get logged and executed on Base Sepolia testnet.

Respond ONLY with valid JSON, no markdown, no explanation outside the JSON, in this exact shape:
{
  "action": "BUY" | "SELL" | "HOLD",
  "token": "<symbol or null>",
  "amount_pct": <number, 0-10>,
  "confidence": <number, 0-100>,
  "reason": "<one or two sentence explanation>"
}
`;

// Helper function to handle transient 503 "High Demand" server spikes safely
async function generateWithRetry(ai, params, retries = 2, delayMs = 5000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await ai.models.generateContent(params);
    } catch (err) {
      if ((err.status === 503 || err.status === 429) && i < retries - 1) {
        console.log(`Model busy/limited, retrying in ${delayMs / 1000}s... (${i + 1}/${retries})`);
        await new Promise(r => setTimeout(r, delayMs));
      } else {
        throw err;
      }
    }
  }
}

export async function decide(signals) {
  const userPrompt = `Current market signals:\n${JSON.stringify(signals, null, 2)}\n\nDecide the next trading action.`;

  // We swap to gemini-2.5-flash as the default, but if it remains busy, you can change this string to gemini-2.0-flash
  const response = await generateWithRetry(ai, {
    model: "gemini-2.5-flash",
    contents: userPrompt,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
    },
  });

  const text = response.text.trim();

  try {
    return JSON.parse(text);
  } catch (err) {
    console.error("Failed to parse Gemini response as JSON:", text);
    throw err;
  }
}

// Only run this execution block when executing `node brain.js` directly
if (process.argv[1] && process.argv[1].endsWith("brain.js")) {
  try {
    const signals = await getSignals();
    console.log("Signals fetched. Asking Gemini...\n");
    
    const decision = await decide(signals);
    console.log(JSON.stringify(decision, null, 2));
  } catch (error) {
    console.error("An error occurred during execution:", error);
  }
}