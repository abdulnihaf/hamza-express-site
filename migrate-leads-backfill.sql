-- One-shot backfill of the `leads` table from existing wa_users + wa_sessions +
-- wa_orders + wa_bookings + wa_messages (lead_status / lead_notes).
--
-- Idempotent: `INSERT OR IGNORE` on the wa_id UNIQUE constraint. Running it twice
-- does nothing the second time. To RE-backfill (e.g. after a stage rule change),
-- truncate first: DELETE FROM leads;
--
-- Run: wrangler d1 execute he-whatsapp --remote --file=migrate-leads-backfill.sql

INSERT OR IGNORE INTO leads (
  wa_id, phone, name,
  stage, status,
  source, source_detail, ad_source_id, ad_headline, ctwa_clid,
  total_orders, total_spent, last_order_at,
  total_bookings, last_booking_at,
  notes,
  first_seen_at, last_seen_at
)
SELECT
  u.wa_id,
  u.phone,
  u.name,

  -- Funnel stage derivation (same precedence as old /api/leads computed column)
  CASE
    WHEN (SELECT COUNT(*) FROM wa_orders
            WHERE wa_id = u.wa_id AND payment_status = 'paid') > 0
      THEN 'ordered'
    WHEN (SELECT COUNT(*) FROM wa_bookings
            WHERE wa_id = u.wa_id AND status != 'cancelled') > 0
      THEN 'booked'
    WHEN s.state IN ('awaiting_upi_payment','awaiting_payment')
      THEN 'payment_pending'
    WHEN s.state = 'awaiting_menu' OR COALESCE(s.cart_total, 0) > 0
      THEN 'engaged'
    WHEN (SELECT COUNT(*) FROM booking_attempts
            WHERE wa_id = u.wa_id AND completed = 0) > 0
      THEN 'booking_dropped'
    ELSE 'new'
  END AS stage,

  -- Pull the most recent lead_status row from wa_messages (legacy location)
  COALESCE(
    (SELECT content FROM wa_messages
       WHERE wa_id = u.wa_id AND msg_type = 'lead_status'
       ORDER BY created_at DESC LIMIT 1),
    'new'
  ) AS status,

  -- Source classification
  CASE
    WHEN s.ctwa_clid IS NOT NULL OR s.ad_source = 'meta_ctwa'     THEN 'ctwa_paid'
    WHEN s.counter_source IS NOT NULL OR s.ad_source = 'station_qr' THEN 'station_qr'
    WHEN u.first_source LIKE '%order-takeaway%'                   THEN 'organic_takeaway'
    WHEN u.first_source LIKE '%book-table%'                       THEN 'organic_dinein'
    WHEN u.first_source LIKE '%meta-combo%'                       THEN 'ctwa_paid'
    WHEN u.first_source LIKE '%google%'                           THEN 'google_paid'
    WHEN u.first_source = 'organic'                               THEN 'direct'
    WHEN u.first_source IS NULL OR u.first_source = 'direct'      THEN 'direct'
    ELSE COALESCE(u.first_source, 'unknown')
  END AS source,

  COALESCE(s.counter_source, u.first_source)    AS source_detail,
  s.ad_source_id,
  s.ad_headline,
  s.ctwa_clid,

  -- Denormalized counters
  (SELECT COUNT(*)           FROM wa_orders   WHERE wa_id = u.wa_id AND payment_status = 'paid')        AS total_orders,
  (SELECT COALESCE(SUM(total),0) FROM wa_orders WHERE wa_id = u.wa_id AND payment_status = 'paid')      AS total_spent,
  (SELECT MAX(created_at)    FROM wa_orders   WHERE wa_id = u.wa_id AND payment_status = 'paid')        AS last_order_at,
  (SELECT COUNT(*)           FROM wa_bookings WHERE wa_id = u.wa_id AND status != 'cancelled')          AS total_bookings,
  (SELECT MAX(created_at)    FROM wa_bookings WHERE wa_id = u.wa_id AND status != 'cancelled')          AS last_booking_at,

  -- Migrate notes from wa_messages (take the most recent)
  COALESCE(
    (SELECT content FROM wa_messages
       WHERE wa_id = u.wa_id AND msg_type = 'lead_notes'
       ORDER BY created_at DESC LIMIT 1),
    ''
  ) AS notes,

  u.created_at                                               AS first_seen_at,
  COALESCE(s.updated_at, u.last_active_at, u.created_at)     AS last_seen_at
FROM wa_users u
LEFT JOIN wa_sessions s ON u.wa_id = s.wa_id;

-- Stamp a migration audit row per lead so we have a marker in the log
INSERT INTO lead_audit (lead_id, wa_id, actor, field, old_value, new_value)
SELECT id, wa_id, 'system', '_migrated', NULL, 'initial_backfill'
FROM leads
WHERE NOT EXISTS (
  SELECT 1 FROM lead_audit
  WHERE lead_audit.lead_id = leads.id AND field = '_migrated'
);
