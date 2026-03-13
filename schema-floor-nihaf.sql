-- Hamza Express Floor Operations — nihaf_ prefixed tables for staging
-- Isolated from production (no prefix) and test_ prefix tables
-- Run: wrangler d1 execute he-whatsapp --remote --file=schema-floor-nihaf.sql

-- ═══════════════════════════════════════════════════════════════
-- STAFF & AUTH (nihaf-isolated)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS nihaf_floor_staff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pin TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'waiter',
  can_captain INTEGER DEFAULT 0,
  can_waiter INTEGER DEFAULT 1,
  can_clean INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  session_token TEXT,
  token_expires_at TEXT,
  current_load INTEGER DEFAULT 0,
  on_shift INTEGER DEFAULT 0,
  shift_started_at TEXT,
  shift_ended_at TEXT,
  last_delivery_at TEXT,
  last_seen_at TEXT,
  odoo_employee_id INTEGER,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_nihaf_floor_staff_pin ON nihaf_floor_staff(pin);
CREATE INDEX IF NOT EXISTS idx_nihaf_floor_staff_token ON nihaf_floor_staff(session_token);

-- ═══════════════════════════════════════════════════════════════
-- FLOOR ORDERS (dine-in from Captain POS config 6)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS nihaf_floor_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  odoo_order_id INTEGER NOT NULL UNIQUE,
  odoo_order_name TEXT,
  config_id INTEGER NOT NULL DEFAULT 6,
  table_number TEXT,
  tracking_number TEXT,
  captain_id INTEGER,
  waiter_id INTEGER REFERENCES nihaf_floor_staff(id),
  auto_assigned INTEGER DEFAULT 0,
  assigned_at TEXT,
  status TEXT DEFAULT 'new',
  total_items INTEGER DEFAULT 0,
  items_ready INTEGER DEFAULT 0,
  items_delivered INTEGER DEFAULT 0,
  customer_note TEXT,
  served_at TEXT,
  paid_at TEXT,
  clean_status TEXT,
  cleaner_id INTEGER,
  clean_ack_at TEXT,
  cleaned_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_nihaf_floor_orders_status ON nihaf_floor_orders(status);
CREATE INDEX IF NOT EXISTS idx_nihaf_floor_orders_waiter ON nihaf_floor_orders(waiter_id);
CREATE INDEX IF NOT EXISTS idx_nihaf_floor_orders_odoo ON nihaf_floor_orders(odoo_order_id);
CREATE INDEX IF NOT EXISTS idx_nihaf_floor_orders_created ON nihaf_floor_orders(created_at);

-- ═══════════════════════════════════════════════════════════════
-- FLOOR ITEMS (per-item readiness tracking)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS nihaf_floor_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  floor_order_id INTEGER NOT NULL REFERENCES nihaf_floor_orders(id),
  odoo_product_id INTEGER NOT NULL,
  product_name TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  category_id INTEGER,
  counter TEXT,
  prep_line_id INTEGER,
  status TEXT DEFAULT 'cooking',
  cooked_at TEXT,
  at_counter_at TEXT,
  picked_up_at TEXT,
  delivered_at TEXT,
  trip_id INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_nihaf_floor_items_order ON nihaf_floor_items(floor_order_id);
CREATE INDEX IF NOT EXISTS idx_nihaf_floor_items_status ON nihaf_floor_items(status);
CREATE INDEX IF NOT EXISTS idx_nihaf_floor_items_prep_line ON nihaf_floor_items(prep_line_id);
CREATE INDEX IF NOT EXISTS idx_nihaf_floor_items_counter ON nihaf_floor_items(counter, status);

-- ═══════════════════════════════════════════════════════════════
-- PICKUP TRIPS (batch pickup records)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS nihaf_pickup_trips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  waiter_id INTEGER NOT NULL REFERENCES nihaf_floor_staff(id),
  counters TEXT NOT NULL,
  tables_served TEXT NOT NULL,
  item_count INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_nihaf_trips_waiter ON nihaf_pickup_trips(waiter_id);
CREATE INDEX IF NOT EXISTS idx_nihaf_trips_started ON nihaf_pickup_trips(started_at);

-- ═══════════════════════════════════════════════════════════════
-- POLL STATE
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS nihaf_floor_poll_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO nihaf_floor_poll_state VALUES ('last_poll_time', '2026-03-13T00:00:00');

-- ═══════════════════════════════════════════════════════════════
-- SEED: Default staff for nihaf staging (same PINs as ops)
-- ═══════════════════════════════════════════════════════════════

INSERT OR IGNORE INTO nihaf_floor_staff (pin, name, role, can_captain, can_waiter, can_clean, is_active, created_at)
VALUES
  ('1001', 'CAPT001', 'captain', 1, 1, 0, 1, datetime('now')),
  ('1002', 'CAPT002', 'captain', 1, 1, 0, 1, datetime('now')),
  ('1003', 'CAPT003', 'captain', 1, 1, 0, 1, datetime('now')),
  ('1004', 'WAIT001', 'waiter', 0, 1, 0, 1, datetime('now')),
  ('1005', 'WAIT002', 'waiter', 0, 1, 0, 1, datetime('now')),
  ('1006', 'WAIT003', 'waiter', 0, 1, 0, 1, datetime('now')),
  ('1011', 'CLEAN001', 'waiter', 0, 0, 1, 1, datetime('now')),
  ('1012', 'CLEAN002', 'waiter', 0, 0, 1, 1, datetime('now'));
