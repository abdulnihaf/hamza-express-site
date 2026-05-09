-- Hamza Express Lead CRM — canonical leads table
-- Run once: wrangler d1 execute he-whatsapp --remote --file=schema-leads.sql
--
-- Design notes:
-- - `leads` is the authoritative CRM row per WhatsApp customer. One row per wa_id.
-- - `stage` is the computed funnel position (refreshed by sync or webhook).
-- - `manual_stage` is a human override. If set, UIs should show it in place of `stage`.
-- - `status`, `tags`, `assignee`, `notes`, `score` are 100% human-managed CRM fields.
-- - `ad_source_id` stores the Meta ad_id (stable numeric), NOT ad_name. ad_name renames
--   silently break attribution; ad_id does not.
-- - wa_messages continues to hold conversation messages. It is NO LONGER the store for
--   lead status/notes — those move to dedicated columns here. Old lead_status/lead_notes
--   rows are preserved in wa_messages for history but no longer read.

CREATE TABLE IF NOT EXISTS leads (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  wa_id           TEXT UNIQUE NOT NULL,
  phone           TEXT,
  name            TEXT,

  -- Funnel (system-computed + optional human override)
  stage           TEXT NOT NULL DEFAULT 'new',   -- new|engaged|payment_pending|booking_dropped|ordered|booked|lost
  manual_stage    TEXT,                           -- if set, overrides `stage` in UI

  -- CRM (human-managed)
  status          TEXT NOT NULL DEFAULT 'new',    -- new|called|interested|not_interested|converted|follow_up|dnd
  score           INTEGER NOT NULL DEFAULT 0,     -- 0-100, lead hotness score
  tags            TEXT NOT NULL DEFAULT '[]',     -- JSON array of strings
  assignee        TEXT,                           -- basheer|faheem|mumtaz|nihaf|unassigned|NULL
  notes           TEXT,

  -- Source attribution (immutable after first-contact)
  source          TEXT,                           -- ctwa_paid|google_paid|organic_takeaway|organic_dinein|station_qr|direct|unknown
  source_detail   TEXT,                           -- counter_source slug OR /go/ slug OR google campaign id
  ad_source_id    TEXT,                           -- Meta ad_id (stable) — NOT ad_name
  ad_headline     TEXT,                           -- snapshot of headline at first contact (display only)
  ctwa_clid       TEXT,                           -- Meta Click-to-WhatsApp click identifier

  -- Denormalized counters (refreshed by /api/leads?action=sync)
  total_orders    INTEGER NOT NULL DEFAULT 0,     -- paid orders only
  total_spent     REAL NOT NULL DEFAULT 0,
  last_order_at   TEXT,
  total_bookings  INTEGER NOT NULL DEFAULT 0,     -- non-cancelled bookings
  last_booking_at TEXT,

  -- Timestamps
  first_seen_at   TEXT NOT NULL,                  -- wa_users.created_at
  last_seen_at    TEXT NOT NULL,                  -- max(session updated, user last_active)
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_leads_wa_id      ON leads(wa_id);
CREATE INDEX IF NOT EXISTS idx_leads_stage      ON leads(stage);
CREATE INDEX IF NOT EXISTS idx_leads_status     ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_assignee   ON leads(assignee);
CREATE INDEX IF NOT EXISTS idx_leads_source     ON leads(source);
CREATE INDEX IF NOT EXISTS idx_leads_ad_source  ON leads(ad_source_id);
CREATE INDEX IF NOT EXISTS idx_leads_last_seen  ON leads(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_score      ON leads(score DESC);

-- ─────────────────────────────────────────────────────────────────────────
-- Audit trail — append-only log of every CRM field change
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lead_audit (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id     INTEGER NOT NULL,
  wa_id       TEXT NOT NULL,
  actor       TEXT NOT NULL,                      -- nihaf|basheer|faheem|mumtaz|naveen|system|webhook
  field       TEXT NOT NULL,                      -- column name OR pseudo-event like '_migrated', '_synced'
  old_value   TEXT,
  new_value   TEXT,
  at          TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(lead_id) REFERENCES leads(id)
);

CREATE INDEX IF NOT EXISTS idx_audit_lead   ON lead_audit(lead_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor  ON lead_audit(actor, at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_wa_id  ON lead_audit(wa_id);

-- ─────────────────────────────────────────────────────────────────────────
-- Saved segments — reusable filter queries (for bulk actions, broadcasts)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS segments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT UNIQUE NOT NULL,
  description   TEXT,
  query_json    TEXT NOT NULL,                    -- serialized filter rules
  created_by    TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seed default segments (skip if already present)
INSERT OR IGNORE INTO segments (name, description, query_json, created_by) VALUES
  ('Hot CTWA leads',       'Paid Meta leads engaged in last 24h, not yet converted',
     '{"source":"ctwa_paid","last_seen_hours":24,"stage_not":["ordered","booked","lost"]}', 'system'),
  ('Stuck in payment',     'In payment_pending stage — needs nudge',
     '{"stage":"payment_pending"}', 'system'),
  ('Booking drops',        'Started booking flow but did not complete',
     '{"stage":"booking_dropped"}', 'system'),
  ('VIP (3+ orders)',      'Regular customers with 3+ paid orders',
     '{"min_orders":3}', 'system'),
  ('Cold but warm',        'Engaged in past but no activity 7–30 days, not lost',
     '{"last_seen_hours_min":168,"last_seen_hours_max":720,"stage_not":["ordered","booked","lost"]}', 'system'),
  ('Unassigned',           'No owner assigned yet',
     '{"assignee":null}', 'system');
