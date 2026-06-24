import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.resolve(__dirname, "aegistrader.db"));

db.pragma("journal_mode = WAL");

// One row per portfolio "instance" — for now we only ever have one (id=1)
db.exec(`
  CREATE TABLE IF NOT EXISTS portfolio (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    starting_value REAL NOT NULL,
    current_value REAL NOT NULL,
    peak_value REAL NOT NULL,
    cash_pct REAL NOT NULL,
    position_token TEXT,
    position_entry_price REAL,
    position_size_pct REAL,
    benchmark_token TEXT,
    benchmark_entry_price REAL,
    benchmark_value REAL,
    settings_json TEXT NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    decision_json TEXT NOT NULL,
    risk_check_json TEXT NOT NULL,
    drawdown_at_time REAL NOT NULL,
    portfolio_value REAL NOT NULL,
    tx_hash TEXT
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS value_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    value REAL NOT NULL,
    benchmark_value REAL
  )
`);

export default db;