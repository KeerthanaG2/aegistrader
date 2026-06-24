"use client";

import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from "recharts";

const API = "http://localhost:4000";

type Trade = {
  timestamp: string;
  decision: { action: string; token: string | null; amount_pct: number; confidence: number; reason: string };
  drawdownAtTime: string;
  portfolioValue: string;
  txHash: string | null;
};

type HistoryPoint = { timestamp: string; value: number; benchmarkValue: number | null };

type Settings = { maxDrawdownPct: number; maxTradePct: number; minConfidence: number };

type Wallet = {
  address: string;
  network: string;
  ethBalance: string;
  explorerUrl: string;
};

type Portfolio = {
  startingValue: number;
  currentValue: number;
  peakValue: number;
  cashPct: number;
  position: { token: string; entryPrice: number; sizePct: number } | null;
  benchmark: { token: string | null; entryPrice: number | null; value: number | null };
  tradeLog: Trade[];
  valueHistory: HistoryPoint[];
  settings: Settings;
  drawdownPct: number;
};

export default function Dashboard() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [draftSettings, setDraftSettings] = useState<Settings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  async function fetchPortfolio() {
    try {
      const res = await fetch(`${API}/api/portfolio`);
      const data = await res.json();
      setPortfolio(data);
      if (!draftSettings) setDraftSettings(data.settings);
      setError(null);
    } catch {
      setError("Cannot reach agent backend. Is index.js running on port 4000?");
    }
  }

  async function fetchWallet() {
    try {
      const res = await fetch(`${API}/api/wallet`);
      const data = await res.json();
      setWallet(data);
    } catch {
      // Keep silent if backend wallet router isn't alive yet during cold boots
    }
  }

  async function runCycle() {
    setRunning(true);
    try {
      const res = await fetch(`${API}/api/run-cycle`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || "Cycle failed — check backend terminal (possibly LLM rate limit).");
      } else {
        setError(null);
      }
      await fetchPortfolio();
      await fetchWallet(); // Update wallet balance instantly if a cycle moves funds
    } catch {
      setError("Cycle failed to run.");
    } finally {
      setRunning(false);
    }
  }

  async function saveSettings() {
    if (!draftSettings) return;
    setSavingSettings(true);
    try {
      const res = await fetch(`${API}/api/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftSettings),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || "Failed to save settings.");
      } else {
        setError(null);
        await fetchPortfolio();
      }
    } catch {
      setError("Failed to save settings.");
    } finally {
      setSavingSettings(false);
    }
  }

  useEffect(() => {
    fetchPortfolio();
    fetchWallet();
  }, []);

  const drawdown = portfolio?.drawdownPct ?? 0;
  const maxDrawdown = portfolio?.settings.maxDrawdownPct ?? 20;
  const drawdownDanger = drawdown >= maxDrawdown * 0.75;
  const pnlPct = portfolio ? ((portfolio.currentValue - portfolio.startingValue) / portfolio.startingValue) * 100 : 0;

  const benchmarkActive = portfolio?.benchmark.token != null;
  const benchmarkPnlPct =
    benchmarkActive && portfolio?.benchmark.value
      ? ((portfolio.benchmark.value - portfolio.startingValue) / portfolio.startingValue) * 100
      : 0;
  const alphaPct = pnlPct - benchmarkPnlPct;

  const chartData = portfolio?.valueHistory.map((h, i) => ({
    cycle: i + 1,
    time: new Date(h.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    value: Number(h.value.toFixed(2)),
    benchmark: h.benchmarkValue != null ? Number(h.benchmarkValue.toFixed(2)) : null,
  })) ?? [];

  return (
    <div style={{ minHeight: "100vh", background: "#0B0D0F", color: "#E8EAED", fontFamily: "'JetBrains Mono', monospace", padding: "32px" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 32, borderBottom: "1px solid #1F2327", paddingBottom: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: "#6B7280", letterSpacing: "0.1em", marginBottom: 4 }}>AUTONOMOUS AGENT · BASE SEPOLIA</div>
            <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>AegisTrader<span style={{ color: "#4ADE80" }}>.</span></h1>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setShowSettings(s => !s)}
              style={{
                background: "transparent",
                color: "#9CA3AF",
                border: "1px solid #1F2327",
                padding: "10px 16px",
                borderRadius: 6,
                fontFamily: "inherit",
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              ⚙ RULES
            </button>
            <button
              onClick={runCycle}
              disabled={running}
              style={{
                background: running ? "#1F2327" : "#4ADE80",
                color: running ? "#6B7280" : "#0B0D0F",
                border: "none",
                padding: "10px 20px",
                borderRadius: 6,
                fontFamily: "inherit",
                fontWeight: 600,
                fontSize: 13,
                cursor: running ? "default" : "pointer",
              }}
            >
              {running ? "RUNNING…" : "▸ RUN CYCLE NOW"}
            </button>
          </div>
        </header>

        {/* 🚀 live Agent Custody Tracker Bar */}
        {wallet && (
          <div style={{ background: "#13161A", border: "1px solid #1F2327", borderRadius: 8, padding: "12px 16px", marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#4ADE80" }} />
              <span style={{ color: "#6B7280", fontWeight: 600 }}>AGENT WALLET</span>
              <span style={{ color: "#E8EAED", fontFamily: "monospace", background: "#1C1F24", padding: "2px 6px", borderRadius: 4 }}>
                {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
              </span>
              <span style={{ color: "#6B7280" }}>·</span>
              <span style={{ color: "#9CA3AF", textTransform: "uppercase" }}>{wallet.network}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <span style={{ color: "#9CA3AF" }}>ETH balance: <span style={{ color: "#E8EAED", fontWeight: 700 }}>{wallet.ethBalance}</span></span>
              <a href={wallet.explorerUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#4ADE80", textDecoration: "none", fontSize: 11, fontWeight: 600 }}>
                Verify custody ↗
              </a>
            </div>
          </div>
        )}

        {error && (
          <div style={{ background: "#2A1215", border: "1px solid #5C1F26", color: "#F87171", padding: 12, borderRadius: 6, marginBottom: 24, fontSize: 13 }}>
            {error}
          </div>
        )}

        {showSettings && draftSettings && (
          <div style={{ background: "#13161A", border: "1px solid #2A2F35", borderRadius: 8, padding: 20, marginBottom: 24 }}>
            <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 16, letterSpacing: "0.05em" }}>
              YOUR RISK RULES — the agent will never exceed these, no matter what it decides
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, marginBottom: 16 }}>
              <SettingSlider
                label="Max drawdown before forced exit"
                value={draftSettings.maxDrawdownPct}
                min={5} max={50} step={1} suffix="%"
                onChange={v => setDraftSettings({ ...draftSettings, maxDrawdownPct: v })}
              />
              <SettingSlider
                label="Max size per trade"
                value={draftSettings.maxTradePct}
                min={1} max={25} step={1} suffix="%"
                onChange={v => setDraftSettings({ ...draftSettings, maxTradePct: v })}
              />
              <SettingSlider
                label="Min confidence to act"
                value={draftSettings.minConfidence}
                min={0} max={100} step={5} suffix="%"
                onChange={v => setDraftSettings({ ...draftSettings, minConfidence: v })}
              />
            </div>
            <button
              onClick={saveSettings}
              disabled={savingSettings}
              style={{
                background: "#4ADE80", color: "#0B0D0F", border: "none", padding: "8px 16px",
                borderRadius: 6, fontFamily: "inherit", fontWeight: 600, fontSize: 12, cursor: "pointer",
              }}
            >
              {savingSettings ? "SAVING…" : "SAVE RULES"}
            </button>
          </div>
        )}

        {portfolio && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 16 }}>
              <Stat label="PORTFOLIO VALUE" value={`$${portfolio.currentValue.toFixed(2)}`} sub={`from $${portfolio.startingValue}`} />
              <Stat label="P&L" value={`${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%`} sub="vs. starting" accent={pnlPct >= 0 ? "#4ADE80" : "#F87171"} />
              <Stat label="DRAWDOWN" value={`${drawdown.toFixed(2)}%`} sub={drawdownDanger ? "⚠ approaching limit" : `of ${maxDrawdown}% max`} accent={drawdownDanger ? "#F87171" : "#E8EAED"} />
              <Stat label="POSITION" value={portfolio.position ? portfolio.position.token : "CASH"} sub={portfolio.position ? `${portfolio.position.sizePct}% allocated` : `${portfolio.cashPct}% cash`} />
            </div>

            {benchmarkActive && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
                <Stat label="AGENT RETURN" value={`${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%`} sub="active decisions" accent="#4ADE80" />
                <Stat label={`BUY & HOLD ${portfolio.benchmark.token}`} value={`${benchmarkPnlPct >= 0 ? "+" : ""}${benchmarkPnlPct.toFixed(2)}%`} sub="passive baseline" />
                <Stat label="AGENT ALPHA" value={`${alphaPct >= 0 ? "+" : ""}${alphaPct.toFixed(2)}%`} sub={alphaPct >= 0 ? "outperforming hold" : "underperforming hold"} accent={alphaPct >= 0 ? "#4ADE80" : "#F87171"} />
              </div>
            )}

            <div style={{ background: "#13161A", border: "1px solid #1F2327", borderRadius: 8, padding: "20px 16px 8px", marginBottom: 24 }}>
              <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 12, letterSpacing: "0.05em", paddingLeft: 4 }}>
                PORTFOLIO VALUE OVER TIME · {chartData.length} DATA POINTS
              </div>
              {chartData.length < 2 ? (
                <div style={{ color: "#6B7280", fontSize: 13, padding: "40px 0", textAlign: "center" }}>
                  Run a few more cycles to populate the chart.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                    <XAxis dataKey="time" stroke="#6B7280" fontSize={11} tickLine={false} axisLine={{ stroke: "#1F2327" }} />
                    <YAxis stroke="#6B7280" fontSize={11} tickLine={false} axisLine={false} domain={["auto", "auto"]} />
                    <Tooltip
                      contentStyle={{ background: "#0B0D0F", border: "1px solid #1F2327", borderRadius: 6, fontSize: 12 }}
                      labelStyle={{ color: "#6B7280" }}
                      formatter={(v: number, name: string) => [`$${v}`, name === "value" ? "Agent" : "Buy & hold"]}
                    />
                    {benchmarkActive && <Legend wrapperStyle={{ fontSize: 11, color: "#6B7280" }} formatter={(v) => v === "value" ? "Agent" : "Buy & hold"} />}
                    <ReferenceLine y={portfolio.startingValue} stroke="#374151" strokeDasharray="3 3" />
                    <Line type="monotone" dataKey="value" stroke="#4ADE80" strokeWidth={2} dot={{ fill: "#4ADE80", r: 3 }} activeDot={{ r: 5 }} connectNulls />
                    {benchmarkActive && (
                      <Line type="monotone" dataKey="benchmark" stroke="#888780" strokeWidth={1.5} strokeDasharray="4 4" dot={false} connectNulls />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            <div style={{ background: "#13161A", border: "1px solid #1F2327", borderRadius: 8, padding: 16, marginBottom: 24 }}>
              <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 12, letterSpacing: "0.05em" }}>ACTIVE RISK GUARDRAILS</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, fontSize: 12 }}>
                <Rule label="Max drawdown" value={`${portfolio.settings.maxDrawdownPct}%`} status={drawdownDanger ? "warn" : "ok"} />
                <Rule label="Max trade size" value={`${portfolio.settings.maxTradePct}% per trade`} status="ok" />
                <Rule label="Min confidence" value={`${portfolio.settings.minConfidence}% to act`} status="ok" />
              </div>
            </div>

            <div style={{ marginBottom: 32 }}>
              <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 8, letterSpacing: "0.05em" }}>
                CIRCUIT BREAKER · {portfolio.settings.maxDrawdownPct}% MAX DRAWDOWN
              </div>
              <div style={{ height: 8, background: "#1F2327", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.min((drawdown / portfolio.settings.maxDrawdownPct) * 100, 100)}%`, background: drawdownDanger ? "#F87171" : "#4ADE80", transition: "width 0.3s ease" }} />
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 12, letterSpacing: "0.05em" }}>
                AGENT DECISION LOG · {portfolio.tradeLog.length} CYCLES
              </div>
              {portfolio.tradeLog.length === 0 && (
                <div style={{ color: "#6B7280", fontSize: 13, padding: 24, textAlign: "center", border: "1px dashed #1F2327", borderRadius: 8 }}>
                  No cycles run yet. Click "Run cycle now" to start the agent.
                </div>
              )}
              {portfolio.tradeLog.slice().reverse().map((t, i) => (
                <div key={i} style={{ borderLeft: `2px solid ${t.decision.action === "BUY" ? "#4ADE80" : t.decision.action === "SELL" ? "#F87171" : "#6B7280"}`, padding: "10px 16px", marginBottom: 8, background: "#13161A", borderRadius: "0 6px 6px 0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>
                      {t.decision.action} {t.decision.token ?? ""} <span style={{ color: "#6B7280", fontWeight: 400 }}>· {t.decision.confidence}% confidence</span>
                    </span>
                    <span style={{ fontSize: 11, color: "#6B7280" }}>{new Date(t.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#9CA3AF", lineHeight: 1.5, marginBottom: t.txHash ? 6 : 0 }}>{t.decision.reason}</div>
                  {t.txHash && (
                    <a
                      href={`https://sepolia.basescan.org/tx/${t.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 11, color: "#4ADE80", textDecoration: "none" }}
                    >
                      View on-chain proof ↗
                    </a>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: string }) {
  return (
    <div style={{ background: "#13161A", border: "1px solid #1F2327", borderRadius: 8, padding: 16 }}>
      <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 8, letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent || "#E8EAED", marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 11, color: "#6B7280" }}>{sub}</div>
    </div>
  );
}

function Rule({ label, value, status }: { label: string; value: string; status: "ok" | "warn" }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#0B0D0F", borderRadius: 6 }}>
      <span style={{ color: "#9CA3AF" }}>{label}</span>
      <span style={{ color: status === "ok" ? "#4ADE80" : "#F87171", fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function SettingSlider({ label, value, min, max, step, suffix, onChange }: { label: string; value: number; min: number; max: number; step: number; suffix: string; onChange: (v: number) => void }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: "#9CA3AF" }}>{label}</span>
        <span style={{ fontSize: 12, color: "#4ADE80", fontWeight: 600 }}>{value}{suffix}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: "100%" }}
      />
    </div>
  );
}