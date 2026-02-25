-- Hamza Express Floor Operations — D1 Schema
-- Captain-Waiter Coordination for Dine-In Orders
-- Run: wrangler d1 execute he-whatsapp --file=schema-floor.sql

-- ═══════════════════════════════════════════════════════════════
-- STAFF & AUTH
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS floor_staff (
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

CREATE INDEX IF NOT EXISTS idx_floor_staff_pin ON floor_staff(pin);
CREATE INDEX IF NOT EXISTS idx_floor_staff_token ON floor_staff(session_token);

-- ═══════════════════════════════════════════════════════════════
-- FLOOR ORDERS (dine-in from Captain POS config 6)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS floor_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  odoo_order_id INTEGER NOT NULL UNIQUE,
  odoo_order_name TEXT,
  config_id INTEGER NOT NULL DEFAULT 6,
  table_number TEXT,
  tracking_number TEXT,
  waiter_id INTEGER REFERENCES floor_staff(id),
  assigned_at TEXT,
  status TEXT DEFAULT 'new',
  total_items INTEGER DEFAULT 0,
  items_ready INTEGER DEFAULT 0,
  items_delivered INTEGER DEFAULT 0,
  customer_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_floor_orders_status ON floor_orders(status);
CREATE INDEX IF NOT EXISTS idx_floor_orders_waiter ON floor_orders(waiter_id);
CREATE INDEX IF NOT EXISTS idx_floor_orders_odoo ON floor_orders(odoo_order_id);
CREATE INDEX IF NOT EXISTS idx_floor_orders_created ON floor_orders(created_at);

-- ═══════════════════════════════════════════════════════════════
-- FLOOR ITEMS (per-item readiness tracking)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS floor_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  floor_order_id INTEGER NOT NULL REFERENCES floor_orders(id),
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

CREATE INDEX IF NOT EXISTS idx_floor_items_order ON floor_items(floor_order_id);
CREATE INDEX IF NOT EXISTS idx_floor_items_status ON floor_items(status);
CREATE INDEX IF NOT EXISTS idx_floor_items_prep_line ON floor_items(prep_line_id);
CREATE INDEX IF NOT EXISTS idx_floor_items_counter ON floor_items(counter, status);

-- ═══════════════════════════════════════════════════════════════
-- PICKUP TRIPS (batch pickup records)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS pickup_trips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  waiter_id INTEGER NOT NULL REFERENCES floor_staff(id),
  counters TEXT NOT NULL,
  tables_served TEXT NOT NULL,
  item_count INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_trips_waiter ON pickup_trips(waiter_id);
CREATE INDEX IF NOT EXISTS idx_trips_started ON pickup_trips(started_at);

-- ═══════════════════════════════════════════════════════════════
-- POLL STATE
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS floor_poll_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Seed initial poll time
INSERT OR IGNORE INTO floor_poll_state VALUES ('last_poll_time', '2026-02-26T00:00:00');
