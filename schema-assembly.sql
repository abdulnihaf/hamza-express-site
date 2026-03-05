-- Delivery Order Assembly — D1 Schema
-- Tracks assembly of multi-station delivery orders (WABA, Swiggy, Zomato)
-- Run: wrangler d1 execute he-whatsapp --remote --file=schema-assembly.sql

-- ═══════════════════════════════════════════════════════════════
-- ASSEMBLY ORDERS (one per delivery order)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS assembly_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,                     -- 'waba', 'swiggy', 'zomato'
  source_order_id TEXT,                     -- Platform order ID (Swiggy #, Zomato #, or HE-C0012)
  odoo_order_id INTEGER,                    -- pos.order ID (links KDS webhooks)
  odoo_order_name TEXT,                     -- "HE - WABA - 00042"
  tracking_number TEXT,                     -- Odoo tracking/token number
  customer_name TEXT,                       -- From platform or WhatsApp profile
  total_items INTEGER DEFAULT 0,
  items_ready INTEGER DEFAULT 0,            -- Count of items with status='ready'
  stations_total INTEGER DEFAULT 0,         -- Distinct stations involved
  stations_ready INTEGER DEFAULT 0,         -- Distinct stations where ALL items ready
  status TEXT DEFAULT 'preparing',          -- preparing → assembled → packed → handed_over
  created_at TEXT DEFAULT (datetime('now')),
  assembled_at TEXT,                        -- When all items ready
  packed_at TEXT,                           -- When physically packed
  handed_over_at TEXT,                      -- When given to delivery partner / customer
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_assembly_orders_status ON assembly_orders(status);
CREATE INDEX IF NOT EXISTS idx_assembly_orders_odoo ON assembly_orders(odoo_order_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_assembly_orders_source ON assembly_orders(source, source_order_id);

-- ═══════════════════════════════════════════════════════════════
-- ASSEMBLY ITEMS (per-item, per-station tracking)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS assembly_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assembly_order_id INTEGER NOT NULL,
  product_name TEXT NOT NULL,
  odoo_product_id INTEGER,
  quantity INTEGER DEFAULT 1,
  category_id INTEGER,                      -- Odoo catId (22=Indian, 24=Chinese, etc.)
  station TEXT NOT NULL,                    -- 'Kitchen Pass', 'Juice Counter', etc.
  prep_line_id INTEGER,                     -- Odoo pos.prep.line ID (bound on first webhook)
  status TEXT DEFAULT 'preparing',          -- preparing → ready
  ready_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (assembly_order_id) REFERENCES assembly_orders(id)
);

CREATE INDEX IF NOT EXISTS idx_assembly_items_order ON assembly_items(assembly_order_id);
CREATE INDEX IF NOT EXISTS idx_assembly_items_prep ON assembly_items(prep_line_id);
CREATE INDEX IF NOT EXISTS idx_assembly_items_status ON assembly_items(status);

-- ═══════════════════════════════════════════════════════════════
-- ASSEMBLY PRODUCT MAP (Swiggy/Zomato name → Odoo product)
-- Dynamic mapping, updated via API when Odoo products change
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS assembly_product_map (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL,                   -- 'swiggy', 'zomato', 'odoo'
  platform_name TEXT NOT NULL,              -- Name as it appears on the platform
  odoo_product_id INTEGER NOT NULL,
  odoo_product_name TEXT NOT NULL,          -- Clean name (no [HE-XXXX] prefix)
  category_id INTEGER,                      -- Odoo pos catId → station routing
  station TEXT,                             -- Resolved station name
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_map_lookup ON assembly_product_map(platform, platform_name);
