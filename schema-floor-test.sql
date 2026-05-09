-- Hamza Express Floor Operations — TEST TABLES
-- Identical schema to production floor tables but with test_ prefix
-- Run: wrangler d1 execute he-whatsapp --remote --file=schema-floor-test.sql

-- ═══════════════════════════════════════════════════════════════
-- TEST STAFF & AUTH
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS test_floor_staff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pin TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'waiter',
  can_captain INTEGER DEFAULT 0,
  can_waiter INTEGER DEFAULT 1,
  is_active INTEGER DEFAULT 1,
  session_token TEXT,
  token_expires_at TEXT,
  current_load INTEGER DEFAULT 0,
  last_seen_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_test_floor_staff_pin ON test_floor_staff(pin);
CREATE INDEX IF NOT EXISTS idx_test_floor_staff_token ON test_floor_staff(session_token);

-- ═══════════════════════════════════════════════════════════════
-- TEST FLOOR ORDERS
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS test_floor_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  odoo_order_id INTEGER NOT NULL UNIQUE,
  odoo_order_name TEXT,
  config_id INTEGER NOT NULL DEFAULT 6,
  table_number TEXT,
  tracking_number TEXT,
  waiter_id INTEGER REFERENCES test_floor_staff(id),
  assigned_at TEXT,
  status TEXT DEFAULT 'new',
  total_items INTEGER DEFAULT 0,
  items_ready INTEGER DEFAULT 0,
  items_delivered INTEGER DEFAULT 0,
  customer_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_test_floor_orders_status ON test_floor_orders(status);
CREATE INDEX IF NOT EXISTS idx_test_floor_orders_waiter ON test_floor_orders(waiter_id);
CREATE INDEX IF NOT EXISTS idx_test_floor_orders_odoo ON test_floor_orders(odoo_order_id);
CREATE INDEX IF NOT EXISTS idx_test_floor_orders_created ON test_floor_orders(created_at);

-- ═══════════════════════════════════════════════════════════════
-- TEST FLOOR ITEMS
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS test_floor_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  floor_order_id INTEGER NOT NULL REFERENCES test_floor_orders(id),
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

CREATE INDEX IF NOT EXISTS idx_test_floor_items_order ON test_floor_items(floor_order_id);
CREATE INDEX IF NOT EXISTS idx_test_floor_items_status ON test_floor_items(status);
CREATE INDEX IF NOT EXISTS idx_test_floor_items_prep_line ON test_floor_items(prep_line_id);
CREATE INDEX IF NOT EXISTS idx_test_floor_items_counter ON test_floor_items(counter, status);

-- ═══════════════════════════════════════════════════════════════
-- TEST PICKUP TRIPS
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS test_pickup_trips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  waiter_id INTEGER NOT NULL REFERENCES test_floor_staff(id),
  counters TEXT NOT NULL,
  tables_served TEXT NOT NULL,
  item_count INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_test_trips_waiter ON test_pickup_trips(waiter_id);
CREATE INDEX IF NOT EXISTS idx_test_trips_started ON test_pickup_trips(started_at);

-- ═══════════════════════════════════════════════════════════════
-- TEST POLL STATE
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS test_floor_poll_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Seed initial poll time
INSERT OR IGNORE INTO test_floor_poll_state VALUES ('last_poll_time', '2026-02-26T00:00:00');

-- Seed admin staff
INSERT OR IGNORE INTO test_floor_staff (pin, name, role, can_captain, can_waiter, is_active, created_at)
VALUES ('0305', 'Nihaf', 'captain', 1, 1, 1, datetime('now'));
