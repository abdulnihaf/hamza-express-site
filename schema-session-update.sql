-- Station QR Ordering — Session Update
-- Adds counter_source to track which station QR the customer scanned
-- Run: wrangler d1 execute he-whatsapp --remote --file=schema-session-update.sql

ALTER TABLE wa_sessions ADD COLUMN counter_source TEXT;
