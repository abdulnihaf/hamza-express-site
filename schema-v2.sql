-- ─────────────────────────────────────────────────────────────────────────
-- HE v2 Cashier Deployment — D1 Schema
-- Apply: wrangler d1 execute he-whatsapp --remote --file=schema-v2.sql
--        OR via admin API: POST /api/admin-sync {action:"migrate-v2-schema", pin:"5882"}
--
-- Tables prefixed he_v2_ to avoid colliding with legacy settlements/cashier_shifts
-- (those are now obsolete but kept for historical reference — see /ops/_archive/).
-- ─────────────────────────────────────────────────────────────────────────

-- ── SHIFT LIFECYCLE ─────────────────────────────────────────────────────
-- One row per cashier shift. Opened when cashier logs in and taps "Open
-- shift" (or seeded via wrangler CLI for the very first shift with opening
-- float). Closes after end-of-day reconciliation wizard completes.
CREATE TABLE IF NOT EXISTS he_v2_shifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  opened_by_pin TEXT NOT NULL,
  opened_by_name TEXT NOT NULL,
  opened_at TEXT NOT NULL,                    -- ISO IST, no Z suffix
  opening_float REAL NOT NULL DEFAULT 0,      -- cash in drawer at shift start
  closed_at TEXT,
  closed_by_pin TEXT,
  closed_by_name TEXT,
  state TEXT NOT NULL DEFAULT 'open',         -- open | reconciling | closed
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_he_v2_shifts_state    ON he_v2_shifts(state);
CREATE INDEX IF NOT EXISTS idx_he_v2_shifts_opened   ON he_v2_shifts(opened_at);

-- ── CAPTAIN → CASHIER HANDOVERS ─────────────────────────────────────────
-- Core UX: captains/waiters continuously hand cash to the cashier throughout
-- the shift. Each handover reduces the captain's "owed to counter" balance
-- by the amount. Cashier records these via tap on /ops/v2/ home screen.
CREATE TABLE IF NOT EXISTS he_v2_handovers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shift_id INTEGER NOT NULL,
  handed_over_at TEXT NOT NULL,
  from_employee_id INTEGER NOT NULL,          -- hr.employee id on test.hamzahotel.com
  from_employee_name TEXT NOT NULL,
  from_employee_pin TEXT NOT NULL,            -- for cross-reference with hnhotels.in
  amount REAL NOT NULL,
  cashier_pin TEXT NOT NULL,                  -- who received (usually Noor)
  cashier_name TEXT NOT NULL,
  notes TEXT,
  FOREIGN KEY (shift_id) REFERENCES he_v2_shifts(id)
);
CREATE INDEX IF NOT EXISTS idx_he_v2_handovers_shift    ON he_v2_handovers(shift_id);
CREATE INDEX IF NOT EXISTS idx_he_v2_handovers_emp      ON he_v2_handovers(from_employee_id);

-- ── SHIFT SETTLEMENTS (per-POS reconciliation) ──────────────────────────
-- At end of shift, cashier reconciles each POS config separately. Two rows
-- per closed shift: one for Counter (config_id=5), one for Captain (cfg=6).
CREATE TABLE IF NOT EXISTS he_v2_shift_settlements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shift_id INTEGER NOT NULL,
  pos_config_id INTEGER NOT NULL,             -- 5 Counter | 6 Captain
  pos_label TEXT NOT NULL,
  odoo_cash REAL NOT NULL DEFAULT 0,          -- sum pos.payment where cash PM
  odoo_upi REAL NOT NULL DEFAULT 0,           -- sum pos.payment where UPI PM (14/52/58)
  odoo_card REAL NOT NULL DEFAULT 0,
  odoo_comp REAL NOT NULL DEFAULT 0,
  physical_cash REAL,                         -- cashier enters drawer count
  paytm_reported REAL,                        -- from Paytm CSV / manual entry
  card_reported REAL,                         -- from card machine batch total
  variance_cash REAL,
  variance_upi REAL,
  variance_card REAL,
  state TEXT DEFAULT 'draft',                 -- draft | submitted
  submitted_at TEXT,
  submitted_by_pin TEXT,
  notes TEXT,
  FOREIGN KEY (shift_id) REFERENCES he_v2_shifts(id)
);
CREATE INDEX IF NOT EXISTS idx_he_v2_settlements_shift  ON he_v2_shift_settlements(shift_id);

-- ── PAYTM STATEMENT UPLOADS ─────────────────────────────────────────────
-- One row per Paytm statement uploaded during shift close. Source=csv for
-- file upload, manual_total for fallback, mobile_upload for phone-side flow.
CREATE TABLE IF NOT EXISTS he_v2_paytm_statements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shift_id INTEGER NOT NULL,
  uploaded_at TEXT NOT NULL,
  uploaded_by_pin TEXT NOT NULL,
  uploaded_by_name TEXT NOT NULL,
  source TEXT NOT NULL,                       -- csv | manual_total | mobile_upload
  total_amount REAL NOT NULL,
  total_count INTEGER NOT NULL DEFAULT 0,
  raw_content TEXT,                           -- full CSV text OR JSON manual entry
  notes TEXT,
  FOREIGN KEY (shift_id) REFERENCES he_v2_shifts(id)
);
CREATE INDEX IF NOT EXISTS idx_he_v2_paytm_shift        ON he_v2_paytm_statements(shift_id);

-- ── PAYTM ↔ ODOO MATCH LOG ──────────────────────────────────────────────
-- After CSV parse + match pass, each transaction gets a row here. Used for
-- audit + resolving discrepancies later.
CREATE TABLE IF NOT EXISTS he_v2_paytm_reconciliation (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  statement_id INTEGER NOT NULL,
  paytm_txn_id TEXT,
  paytm_amount REAL NOT NULL,
  paytm_ts TEXT,
  odoo_payment_id INTEGER,                    -- null if unmatched
  match_type TEXT NOT NULL,                   -- exact | fuzzy | paytm_only | odoo_only
  resolved_by_pin TEXT,
  resolution_note TEXT,
  FOREIGN KEY (statement_id) REFERENCES he_v2_paytm_statements(id)
);
CREATE INDEX IF NOT EXISTS idx_he_v2_paytm_recon_stmt   ON he_v2_paytm_reconciliation(statement_id);

-- ── CASH COLLECTIONS (Basheer / Nihaf picks up cash) ────────────────────
-- When a collector empties (part of) the drawer. Reduces drawer expected by
-- the collected amount. Receipt photo optional, uploaded to Drive.
CREATE TABLE IF NOT EXISTS he_v2_cash_collections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shift_id INTEGER NOT NULL,
  collected_at TEXT NOT NULL,
  collector_pin TEXT NOT NULL,
  collector_name TEXT NOT NULL,
  amount REAL NOT NULL,
  destination TEXT NOT NULL,                  -- HDFC | Safe | Other:<freetext>
  receipt_drive_id TEXT,
  receipt_drive_link TEXT,
  notes TEXT,
  FOREIGN KEY (shift_id) REFERENCES he_v2_shifts(id)
);
CREATE INDEX IF NOT EXISTS idx_he_v2_collections_shift  ON he_v2_cash_collections(shift_id);

-- ── SHIFT-SCOPED EXPENSE MIRROR ─────────────────────────────────────────
-- Every expense entered via /ops/v2/ dual-writes to hnhotels.in/api/spend
-- (central Odoo ledger) AND this local table. Local copy enables fast
-- drawer reconciliation without waiting on hnhotels.in.
CREATE TABLE IF NOT EXISTS he_v2_shift_expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shift_id INTEGER NOT NULL,
  recorded_at TEXT NOT NULL,
  recorded_by_pin TEXT NOT NULL,
  recorded_by_name TEXT NOT NULL,
  category_id INTEGER NOT NULL,
  category_label TEXT NOT NULL,
  product_id INTEGER NOT NULL,
  product_name TEXT NOT NULL,
  vendor_id INTEGER,
  vendor_name TEXT,
  amount REAL NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'cash',  -- cash (drawer) | hdfc | upi
  hnhotels_expense_id INTEGER,                   -- hr.expense or account.move id
  photo_drive_link TEXT,
  notes TEXT,
  FOREIGN KEY (shift_id) REFERENCES he_v2_shifts(id)
);
CREATE INDEX IF NOT EXISTS idx_he_v2_expenses_shift     ON he_v2_shift_expenses(shift_id);
CREATE INDEX IF NOT EXISTS idx_he_v2_expenses_category  ON he_v2_shift_expenses(category_id);
