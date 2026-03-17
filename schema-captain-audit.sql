-- Captain POS Audit Log — Records every action on Captain POS (config 6)
-- Tracks: order creation, item add/remove/qty change, payments, cancellations, table changes
-- Run: wrangler d1 execute he-whatsapp --remote --file=schema-captain-audit.sql

-- ═══════════════════════════════════════════════════════════════
-- AUDIT EVENT LOG — immutable append-only log of every POS action
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS captain_pos_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  -- Event types:
  --   order_created      — new order appears (draft)
  --   order_paid         — order validated/paid
  --   order_cancelled    — order cancelled
  --   order_deleted      — order disappeared from Odoo (offline loss)
  --   item_added         — new line item added
  --   item_removed       — line item removed
  --   item_qty_changed   — quantity changed on existing item
  --   payment_recorded   — payment method + amount logged
  --   table_changed      — table assignment changed
  --   amount_changed     — order total changed (catch-all)
  --   captain_changed    — cashier/employee changed
  --   state_changed      — generic state transition

  odoo_order_id INTEGER NOT NULL,
  odoo_order_name TEXT,
  table_number TEXT,
  captain TEXT,
  employee_id INTEGER,
  tracking_number TEXT,
  amount REAL,
  details TEXT,            -- JSON with event-specific data
  created_at TEXT NOT NULL -- IST timestamp
);

CREATE INDEX IF NOT EXISTS idx_cpl_order ON captain_pos_log(odoo_order_id);
CREATE INDEX IF NOT EXISTS idx_cpl_type ON captain_pos_log(event_type);
CREATE INDEX IF NOT EXISTS idx_cpl_created ON captain_pos_log(created_at);
CREATE INDEX IF NOT EXISTS idx_cpl_captain ON captain_pos_log(captain);

-- ═══════════════════════════════════════════════════════════════
-- ORDER SNAPSHOTS — last known state of each order for diff detection
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS captain_pos_snapshot (
  odoo_order_id INTEGER PRIMARY KEY,
  odoo_order_name TEXT,
  state TEXT,
  amount_total REAL,
  amount_tax REAL,
  table_name TEXT,
  table_id INTEGER,
  employee_id INTEGER,
  employee_name TEXT,
  tracking_number TEXT,
  items_json TEXT,          -- JSON: [{product_id, name, qty, price}]
  payments_json TEXT,       -- JSON: [{method, amount}]
  line_count INTEGER,
  write_date TEXT,
  first_seen_at TEXT,       -- IST
  last_seen_at TEXT          -- IST
);

-- ═══════════════════════════════════════════════════════════════
-- TEST ENVIRONMENT (test_ prefix)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS test_captain_pos_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  odoo_order_id INTEGER NOT NULL,
  odoo_order_name TEXT,
  table_number TEXT,
  captain TEXT,
  employee_id INTEGER,
  tracking_number TEXT,
  amount REAL,
  details TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tcpl_order ON test_captain_pos_log(odoo_order_id);
CREATE INDEX IF NOT EXISTS idx_tcpl_type ON test_captain_pos_log(event_type);
CREATE INDEX IF NOT EXISTS idx_tcpl_created ON test_captain_pos_log(created_at);
CREATE INDEX IF NOT EXISTS idx_tcpl_captain ON test_captain_pos_log(captain);

CREATE TABLE IF NOT EXISTS test_captain_pos_snapshot (
  odoo_order_id INTEGER PRIMARY KEY,
  odoo_order_name TEXT,
  state TEXT,
  amount_total REAL,
  amount_tax REAL,
  table_name TEXT,
  table_id INTEGER,
  employee_id INTEGER,
  employee_name TEXT,
  tracking_number TEXT,
  items_json TEXT,
  payments_json TEXT,
  line_count INTEGER,
  write_date TEXT,
  first_seen_at TEXT,
  last_seen_at TEXT
);
