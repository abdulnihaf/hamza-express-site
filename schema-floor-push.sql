-- Web Push subscription storage for floor staff notifications
-- Run: wrangler d1 execute he-whatsapp --remote --file=schema-floor-push.sql
ALTER TABLE floor_staff ADD COLUMN push_subscription TEXT;
