-- Captain Settlement System — D1 Schema Extension
-- Run: wrangler d1 execute he-whatsapp --remote --file=schema-captain-settlement.sql
-- Mirrors NCH shift_runner_checkpoints + cashier_shifts model

-- Shift parent record (cashier "End My Shift" wizard)
CREATE TABLE IF NOT EXISTS cashier_shifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cashier_name TEXT NOT NULL,
  settled_at TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  -- Counter assessment
  counter_cash_expected REAL DEFAULT 0,
  counter_cash_entered REAL DEFAULT 0,
  counter_cash_variance REAL DEFAULT 0,
  counter_upi REAL DEFAULT 0,
  counter_card REAL DEFAULT 0,
  counter_comp REAL DEFAULT 0,
  counter_qr_odoo REAL DEFAULT 0,
  counter_qr_razorpay REAL DEFAULT 0,
  counter_qr_variance REAL DEFAULT 0,
  -- Drawer formula
  petty_cash_start REAL DEFAULT 0,
  counter_cash_settled REAL DEFAULT 0,
  captain_cash_settled REAL DEFAULT 0,
  expenses_total REAL DEFAULT 0,
  expected_drawer REAL DEFAULT 0,
  drawer_cash_entered REAL DEFAULT 0,
  drawer_variance REAL DEFAULT 0,
  -- Grand reconciliation
  total_cash_physical REAL DEFAULT 0,
  total_cash_expected REAL DEFAULT 0,
  final_variance REAL DEFAULT 0,
  variance_resolved REAL DEFAULT 0,
  variance_unresolved REAL DEFAULT 0,
  discrepancy_resolutions TEXT DEFAULT '[]',
  captain_count INTEGER DEFAULT 0,
  notes TEXT DEFAULT '',
  handover_to TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_cs_settled ON cashier_shifts(settled_at);
CREATE INDEX IF NOT EXISTS idx_cs_cashier ON cashier_shifts(cashier_name);

-- Per-captain checkpoint within a shift
CREATE TABLE IF NOT EXISTS shift_captain_checkpoints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shift_id INTEGER NOT NULL REFERENCES cashier_shifts(id),
  captain_id TEXT NOT NULL,        -- 'captain_1', 'captain_2', etc. (matches CAPTAINS key)
  captain_name TEXT NOT NULL,
  employee_id INTEGER,             -- Odoo hr.employee ID
  orders_total REAL DEFAULT 0,
  orders_count INTEGER DEFAULT 0,
  upi_amount REAL DEFAULT 0,
  card_amount REAL DEFAULT 0,
  comp_amount REAL DEFAULT 0,
  cash_calculated REAL DEFAULT 0,  -- orders - upi - card - comp
  cash_collected REAL DEFAULT 0,   -- physical cash handed over by captain
  cash_variance REAL DEFAULT 0,    -- collected - calculated
  status TEXT NOT NULL DEFAULT 'present'  -- 'present' | 'absent'
);
CREATE INDEX IF NOT EXISTS idx_scc_shift ON shift_captain_checkpoints(shift_id);
CREATE INDEX IF NOT EXISTS idx_scc_captain ON shift_captain_checkpoints(captain_id);

-- Audit logs for discrepancy detection
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  check_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '{}',
  period_from TEXT,
  period_to TEXT,
  alerted_to TEXT DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_type ON audit_logs(check_type);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
