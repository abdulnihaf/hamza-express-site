-- Counter POS Audit Log — Records every action on Cash Counter POS (config 5)
-- Run: wrangler d1 execute he-whatsapp --remote --file=schema-counter-audit.sql

CREATE TABLE IF NOT EXISTS counter_pos_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  odoo_order_id INTEGER NOT NULL,
  odoo_order_name TEXT,
  captain TEXT,
  employee_id INTEGER,
  tracking_number TEXT,
  amount REAL,
  details TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ctpl_order ON counter_pos_log(odoo_order_id);
CREATE INDEX IF NOT EXISTS idx_ctpl_type ON counter_pos_log(event_type);
CREATE INDEX IF NOT EXISTS idx_ctpl_created ON counter_pos_log(created_at);

CREATE TABLE IF NOT EXISTS counter_pos_snapshot (
  odoo_order_id INTEGER PRIMARY KEY,
  odoo_order_name TEXT,
  state TEXT,
  amount_total REAL,
  amount_tax REAL,
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

-- TEST ENVIRONMENT
CREATE TABLE IF NOT EXISTS test_counter_pos_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  odoo_order_id INTEGER NOT NULL,
  odoo_order_name TEXT,
  captain TEXT,
  employee_id INTEGER,
  tracking_number TEXT,
  amount REAL,
  details TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tctpl_order ON test_counter_pos_log(odoo_order_id);
CREATE INDEX IF NOT EXISTS idx_tctpl_type ON test_counter_pos_log(event_type);
CREATE INDEX IF NOT EXISTS idx_tctpl_created ON test_counter_pos_log(created_at);

CREATE TABLE IF NOT EXISTS test_counter_pos_snapshot (
  odoo_order_id INTEGER PRIMARY KEY,
  odoo_order_name TEXT,
  state TEXT,
  amount_total REAL,
  amount_tax REAL,
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
