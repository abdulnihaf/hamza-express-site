-- Floor Operations v2 — Payment Detection + Cleaning Workflow
-- Run: wrangler d1 execute he-whatsapp --remote --file=schema-floor-v2.sql

-- ═══════════════════════════════════════════════════════════════
-- FLOOR ORDERS: payment + cleaning tracking
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE floor_orders ADD COLUMN served_at TEXT;
ALTER TABLE floor_orders ADD COLUMN paid_at TEXT;
ALTER TABLE floor_orders ADD COLUMN clean_status TEXT;        -- null → needs_cleaning → cleaning → cleaned
ALTER TABLE floor_orders ADD COLUMN cleaner_id INTEGER;
ALTER TABLE floor_orders ADD COLUMN clean_ack_at TEXT;
ALTER TABLE floor_orders ADD COLUMN cleaned_at TEXT;

-- ═══════════════════════════════════════════════════════════════
-- FLOOR STAFF: cleaner capability
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE floor_staff ADD COLUMN can_clean INTEGER DEFAULT 0;
