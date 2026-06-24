import { runCycle } from "./agent.js";

const INTERVAL_MS = 15 * 60 * 1000; // 15 minutes — adjust for demo purposes

async function loop() {
  await runCycle();
  console.log(`\n⏳ Next cycle in ${INTERVAL_MS / 60000} minutes...\n`);
}

loop(); // run once immediately
setInterval(loop, INTERVAL_MS);