-- Hamza Express WhatsApp Ordering System — D1 Schema
-- Run: wrangler d1 execute he-whatsapp --file=schema-whatsapp.sql

CREATE TABLE IF NOT EXISTS wa_users (
  wa_id TEXT PRIMARY KEY,
  name TEXT,
  phone TEXT,
  total_orders INTEGER DEFAULT 0,
  total_spent REAL DEFAULT 0,
  last_order_id INTEGER,
  created_at TEXT NOT NULL,
  last_active_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS wa_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_code TEXT UNIQUE NOT NULL,
  wa_id TEXT NOT NULL,
  items TEXT NOT NULL,
  subtotal REAL NOT NULL,
  total REAL NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'upi',
  payment_status TEXT DEFAULT 'pending',
  razorpay_payment_id TEXT,
  razorpay_link_id TEXT,
  razorpay_link_url TEXT,
  collection_point TEXT,
  odoo_order_id INTEGER,
  odoo_order_name TEXT,
  tracking_number TEXT,
  status TEXT DEFAULT 'payment_pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS wa_sessions (
  wa_id TEXT PRIMARY KEY,
  state TEXT DEFAULT 'idle',
  cart TEXT DEFAULT '[]',
  cart_total REAL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_wa_orders_wa_id ON wa_orders(wa_id);
CREATE INDEX IF NOT EXISTS idx_wa_orders_status ON wa_orders(status);
CREATE INDEX IF NOT EXISTS idx_wa_orders_created ON wa_orders(created_at);
CREATE INDEX IF NOT EXISTS idx_wa_orders_code ON wa_orders(order_code);
CREATE INDEX IF NOT EXISTS idx_wa_orders_rzp_link ON wa_orders(razorpay_link_id);
