-- HE Settlement System — D1 Schema
-- Run: wrangler d1 execute he-whatsapp --remote --file=schema-settlement.sql

-- Captain/Counter cash settlements
CREATE TABLE IF NOT EXISTS settlements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  point TEXT NOT NULL,              -- 'counter', 'captain_1', 'captain_2', 'captain_3'
  point_name TEXT NOT NULL,         -- 'Cash Counter', 'Captain 1', etc.
  settled_by TEXT NOT NULL,         -- PIN-verified staff name
  settled_at TEXT NOT NULL,         -- ISO timestamp
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  cash_expected REAL DEFAULT 0,     -- expected cash (Odoo cash PM for this point)
  cash_collected REAL DEFAULT 0,    -- physical cash handed over
  cash_variance REAL DEFAULT 0,     -- collected - expected
  upi_odoo REAL DEFAULT 0,          -- UPI per Odoo (PM-specific)
  upi_razorpay REAL DEFAULT 0,      -- UPI per Razorpay QR
  upi_variance REAL DEFAULT 0,      -- razorpay - odoo
  card_amount REAL DEFAULT 0,
  comp_amount REAL DEFAULT 0,
  total_sales REAL DEFAULT 0,       -- total order amount for this point
  notes TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_stl_point ON settlements(point);
CREATE INDEX IF NOT EXISTS idx_stl_settled_at ON settlements(settled_at);

-- Counter petty cash expenses
CREATE TABLE IF NOT EXISTS counter_expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recorded_by TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  amount REAL NOT NULL,
  reason TEXT NOT NULL,
  notes TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_exp_at ON counter_expenses(recorded_at);

-- Cash collections (Nihaf/Naveen)
CREATE TABLE IF NOT EXISTS cash_collections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  collected_by TEXT NOT NULL,
  collected_at TEXT NOT NULL,
  amount REAL NOT NULL,             -- cash taken
  petty_cash REAL DEFAULT 0,        -- left at counter
  expenses REAL DEFAULT 0,          -- total expenses in period
  expected REAL DEFAULT 0,          -- total expected at counter
  discrepancy REAL DEFAULT 0,       -- expected - (amount + petty)
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  notes TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_col_at ON cash_collections(collected_at);
