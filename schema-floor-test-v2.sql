-- Floor Operations v2 — TEST TABLES Migration
-- Adds payment detection + cleaning workflow columns to test_ prefixed tables
-- Run: wrangler d1 execute he-whatsapp --remote --file=schema-floor-test-v2.sql

-- ═══════════════════════════════════════════════════════════════
-- TEST FLOOR ORDERS: payment + cleaning tracking
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE test_floor_orders ADD COLUMN served_at TEXT;
ALTER TABLE test_floor_orders ADD COLUMN paid_at TEXT;
ALTER TABLE test_floor_orders ADD COLUMN clean_status TEXT;
ALTER TABLE test_floor_orders ADD COLUMN cleaner_id INTEGER;
ALTER TABLE test_floor_orders ADD COLUMN clean_ack_at TEXT;
ALTER TABLE test_floor_orders ADD COLUMN cleaned_at TEXT;
ALTER TABLE test_floor_orders ADD COLUMN captain_id INTEGER;

-- ═══════════════════════════════════════════════════════════════
-- TEST FLOOR STAFF: cleaner capability
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE test_floor_staff ADD COLUMN can_clean INTEGER DEFAULT 0;
