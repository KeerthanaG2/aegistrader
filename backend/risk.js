import db from "./db.js";

const DEFAULT_SETTINGS = {
  maxDrawdownPct: 20,
  maxTradePct: 10,
  minConfidence: 40,
};

// Ensure row 1 exists on first run ever
function ensureInitialized() {
  const existing = db.prepare("SELECT id FROM portfolio WHERE id = 1").get();
  if (!existing) {
    db.prepare(`
      INSERT INTO portfolio (id, starting_value, current_value, peak_value, cash_pct, settings_json)
      VALUES (1, 1000, 1000, 1000, 100, ?)
    `).run(JSON.stringify(DEFAULT_SETTINGS));

    db.prepare(`
      INSERT INTO value_history (timestamp, value, benchmark_value)
      VALUES (?, 1000, 1000)
    `).run(new Date().toISOString());
  }
}
ensureInitialized();

function loadPortfolioRow() {
  return db.prepare("SELECT * FROM portfolio WHERE id = 1").get();
}

function getSettings() {
  const row = loadPortfolioRow();
  return JSON.parse(row.settings_json);
}

export function updateSettings(newSettings) {
  const current = getSettings();
  const merged = { ...current, ...newSettings };
  db.prepare("UPDATE portfolio SET settings_json = ? WHERE id = 1").run(JSON.stringify(merged));
  return merged;
}

export function getPortfolioState() {
  const row = loadPortfolioRow();

  const tradeLog = db.prepare("SELECT * FROM trades ORDER BY id ASC").all().map(t => ({
    timestamp: t.timestamp,
    decision: JSON.parse(t.decision_json),
    riskCheck: JSON.parse(t.risk_check_json),
    drawdownAtTime: t.drawdown_at_time.toFixed(2),
    portfolioValue: t.portfolio_value.toFixed(2),
    txHash: t.tx_hash,
  }));

  const valueHistory = db.prepare("SELECT * FROM value_history ORDER BY id ASC").all().map(h => ({
    timestamp: h.timestamp,
    value: h.value,
    benchmarkValue: h.benchmark_value,
  }));

  return {
    startingValue: row.starting_value,
    currentValue: row.current_value,
    peakValue: row.peak_value,
    cashPct: row.cash_pct,
    position: row.position_token
      ? { token: row.position_token, entryPrice: row.position_entry_price, sizePct: row.position_size_pct }
      : null,
    benchmark: {
      token: row.benchmark_token,
      entryPrice: row.benchmark_entry_price,
      value: row.benchmark_value,
    },
    tradeLog,
    valueHistory,
    settings: getSettings(),
  };
}

function getCurrentDrawdownPct() {
  const row = loadPortfolioRow();
  if (row.peak_value === 0) return 0;
  return ((row.peak_value - row.current_value) / row.peak_value) * 100;
}

export function getDrawdownPct() {
  return getCurrentDrawdownPct();
}

export function markToMarket(currentMarketData) {
  const row = loadPortfolioRow();
  if (!row.position_token) return;

  const tokenData = currentMarketData.find(m => m.symbol === row.position_token);
  if (!tokenData) return;

  const priceChangePct = (tokenData.price - row.position_entry_price) / row.position_entry_price;
  const positionValueChange = row.starting_value * (row.position_size_pct / 100) * priceChangePct;
  const newCurrentValue = row.starting_value + positionValueChange;
  const newPeakValue = Math.max(row.peak_value, newCurrentValue);

  db.prepare("UPDATE portfolio SET current_value = ?, peak_value = ? WHERE id = 1")
    .run(newCurrentValue, newPeakValue);
}

export function markBenchmarkToMarket(currentMarketData) {
  const row = loadPortfolioRow();
  if (!row.benchmark_token || !row.benchmark_entry_price) return;

  const tokenData = currentMarketData.find(m => m.symbol === row.benchmark_token);
  if (!tokenData) return;

  const priceChangePct = (tokenData.price - row.benchmark_entry_price) / row.benchmark_entry_price;
  const newBenchmarkValue = row.starting_value * (1 + priceChangePct);

  db.prepare("UPDATE portfolio SET benchmark_value = ? WHERE id = 1").run(newBenchmarkValue);
}

export function initBenchmarkIfNeeded(token, currentMarketData) {
  const row = loadPortfolioRow();
  if (row.benchmark_token) return;

  const tokenData = currentMarketData.find(m => m.symbol === token);
  if (!tokenData) return;

  db.prepare("UPDATE portfolio SET benchmark_token = ?, benchmark_entry_price = ?, benchmark_value = ? WHERE id = 1")
    .run(token, tokenData.price, row.starting_value);
}

export function checkRiskGuardrails(decision) {
  const settings = getSettings();
  const drawdown = getCurrentDrawdownPct();

  if (drawdown >= settings.maxDrawdownPct) {
    return {
      allowed: false,
      reason: `Circuit breaker triggered: drawdown at ${drawdown.toFixed(2)}% exceeds ${settings.maxDrawdownPct}% limit. Forcing exit to stable.`,
      forceAction: "EXIT_TO_STABLE",
    };
  }

  if (decision.amount_pct > settings.maxTradePct) {
    return {
      allowed: true,
      reason: `Requested ${decision.amount_pct}% exceeds max trade size. Capped to ${settings.maxTradePct}%.`,
      adjustedDecision: { ...decision, amount_pct: settings.maxTradePct },
    };
  }

  if (decision.action !== "HOLD" && decision.confidence < settings.minConfidence) {
    return {
      allowed: false,
      reason: `Confidence too low (${decision.confidence}%) to act. Defaulting to HOLD.`,
      forceAction: "HOLD",
    };
  }

  return { allowed: true, reason: "Within risk guardrails.", adjustedDecision: decision };
}

export function applyTradeToPortfolio(finalDecision, currentMarketData) {
  if (finalDecision.action === "BUY") {
    const tokenData = currentMarketData.find(m => m.symbol === finalDecision.token);
    db.prepare(`
      UPDATE portfolio
      SET position_token = ?, position_entry_price = ?, position_size_pct = ?, cash_pct = ?
      WHERE id = 1
    `).run(finalDecision.token, tokenData.price, finalDecision.amount_pct, 100 - finalDecision.amount_pct);
  } else if (finalDecision.action === "SELL" || finalDecision.action === "EXIT_TO_STABLE") {
    db.prepare(`
      UPDATE portfolio
      SET position_token = NULL, position_entry_price = NULL, position_size_pct = NULL, cash_pct = 100
      WHERE id = 1
    `).run();
  }
}

export function logTrade(decision, riskCheck, txHash = null) {
  const drawdown = getCurrentDrawdownPct();
  const row = loadPortfolioRow();

  db.prepare(`
    INSERT INTO trades (timestamp, decision_json, risk_check_json, drawdown_at_time, portfolio_value, tx_hash)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    new Date().toISOString(),
    JSON.stringify(decision),
    JSON.stringify(riskCheck),
    drawdown,
    row.current_value,
    txHash
  );
}

export function recordHistoryPoint() {
  const row = loadPortfolioRow();
  db.prepare(`
    INSERT INTO value_history (timestamp, value, benchmark_value)
    VALUES (?, ?, ?)
  `).run(new Date().toISOString(), row.current_value, row.benchmark_value);
}