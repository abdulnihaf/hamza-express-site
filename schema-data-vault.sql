-- Hamza Express — Data Vault (Wave 3.0)
-- Run: wrangler d1 execute he-whatsapp --remote --file=schema-data-vault.sql
--
-- Purpose: never lose a byte of what Meta sends us. Meta does not retain
-- message bodies, media, ad attribution, or delivery status server-side
-- long-term, so D1 is our permanent record. These four tables (+1 ALTER
-- on wa_messages) close every data-loss gap identified in the Wave 3.0 audit.
--
-- Tables:
--   wa_webhook_events  — full raw webhook body, every event, no filter
--   wa_message_status  — sent/delivered/read/failed callbacks per outbound
--   ad_referrals       — immutable first-contact CTWA attribution
--   wa_messages (+cols) — wa_message_id correlation + full JSON content

-- ─────────────────────────────────────────────────────────────────────
-- 1. wa_webhook_events — the firehose. Every POST from Meta, raw.
-- ─────────────────────────────────────────────────────────────────────
-- Written at the very top of processWebhook, before any business logic.
-- If processing throws, error_text is populated so we know which events
-- failed. Enables full forensic replay: re-run processing against any
-- saved row at any time in the future.
CREATE TABLE IF NOT EXISTS wa_webhook_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  phone_number_id TEXT,                          -- which WABA line received it
  event_kind      TEXT,                          -- 'message' | 'status' | 'other'
  wa_id           TEXT,                          -- extracted for indexing (if present)
  message_id      TEXT,                          -- wamid.xxx (if present)
  raw_json        TEXT    NOT NULL,              -- full webhook body, untouched
  processed       INTEGER NOT NULL DEFAULT 1,    -- 1 = processing returned OK
  error_text      TEXT                           -- set if processWebhook threw
);

CREATE INDEX IF NOT EXISTS idx_wwe_ts       ON wa_webhook_events(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_wwe_wa       ON wa_webhook_events(wa_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_wwe_msgid    ON wa_webhook_events(message_id);
CREATE INDEX IF NOT EXISTS idx_wwe_kind     ON wa_webhook_events(event_kind, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_wwe_failed   ON wa_webhook_events(processed, received_at DESC);

-- ─────────────────────────────────────────────────────────────────────
-- 2. wa_message_status — delivery callbacks per outbound message
-- ─────────────────────────────────────────────────────────────────────
-- Meta sends a webhook for each state change of an outbound message:
-- sent → delivered → read (or → failed). Today we ignore all of it.
-- With this table we can answer "did Basheer's reply actually land?"
-- and "which nurture messages were blocked/failed?" Non-destructive:
-- each state is a new row, so we keep the full history per message.
CREATE TABLE IF NOT EXISTS wa_message_status (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  wa_message_id       TEXT    NOT NULL,          -- Meta's wamid.XXXX
  recipient_id        TEXT,                      -- wa_id of the customer
  status              TEXT    NOT NULL,          -- 'sent' | 'delivered' | 'read' | 'failed'
  ts                  TEXT    NOT NULL,          -- Meta timestamp (ISO)
  conversation_id     TEXT,                      -- Meta conversation id (billable unit)
  conversation_origin TEXT,                      -- marketing|utility|authentication|service|referral_conversion
  pricing_category    TEXT,                      -- marketing|utility|authentication|service
  pricing_billable    INTEGER,                   -- 1 if billable
  error_code          TEXT,
  error_title         TEXT,
  error_message       TEXT,
  raw_json            TEXT,                      -- the full status object
  received_at         TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_wms_msgid      ON wa_message_status(wa_message_id);
CREATE INDEX IF NOT EXISTS idx_wms_recipient  ON wa_message_status(recipient_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_wms_status     ON wa_message_status(status, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_wms_conv       ON wa_message_status(conversation_id);

-- ─────────────────────────────────────────────────────────────────────
-- 3. ad_referrals — immutable CTWA attribution vault
-- ─────────────────────────────────────────────────────────────────────
-- Meta only attaches `referral` to the very first message from a CTWA click.
-- If we don't capture it right then, that attribution is lost forever.
-- Today it's stored on wa_sessions (mutable, single-row per user), so
-- customers who ad-click but don't order have no permanent record.
--
-- Rule: append-only. Every referral payload becomes a new row. Unique
-- index on (wa_id, ctwa_clid, message_id) prevents dup from retries.
CREATE TABLE IF NOT EXISTS ad_referrals (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  wa_id           TEXT    NOT NULL,
  first_seen_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  ctwa_clid       TEXT,
  source_type     TEXT,                          -- 'ad' | 'post' | etc.
  source_id       TEXT,                          -- Meta ad_id (stable)
  source_url      TEXT,                          -- fb.me URL the ad hit
  headline        TEXT,                          -- ad headline snapshot
  body            TEXT,                          -- ad body text snapshot
  media_type      TEXT,                          -- image | video
  thumbnail_url   TEXT,
  image_url       TEXT,
  video_url       TEXT,
  message_id      TEXT,                          -- the first message that carried it
  raw_json        TEXT                           -- full referral object
);

CREATE INDEX IF NOT EXISTS idx_ar_wa        ON ad_referrals(wa_id, first_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_ar_clid      ON ad_referrals(ctwa_clid);
CREATE INDEX IF NOT EXISTS idx_ar_source    ON ad_referrals(source_id, first_seen_at DESC);
-- Dedup guard — a single click might webhook twice via Meta retries
CREATE UNIQUE INDEX IF NOT EXISTS idx_ar_unique
  ON ad_referrals(wa_id, COALESCE(ctwa_clid, ''), COALESCE(message_id, ''));

-- ─────────────────────────────────────────────────────────────────────
-- 4. wa_messages enrichment — add columns for correlation + full content
-- ─────────────────────────────────────────────────────────────────────
-- Existing table was created ad-hoc with (wa_id, direction, msg_type,
-- content, created_at). We add:
--   wa_message_id   — Meta's wamid.xxx, enables wa_message_status joins
--   content_json    — the full message JSON (text body, captions, button
--                     titles, interactive payloads, order items, etc.).
--                     Preserves everything the current 'content' column
--                     collapses to a single string.
--   template_name   — for outbound templates, the template name used
--   media_id        — for inbound media, the Meta media_id (needed for
--                     Phase 2 R2 download). URL dies in ~5 minutes!
--
-- Note: SQLite ALTER TABLE ADD COLUMN has no IF NOT EXISTS. Running
-- this file twice will error on the ALTERs — that's expected; ignore
-- the "duplicate column" errors on repeat runs.
ALTER TABLE wa_messages ADD COLUMN wa_message_id TEXT;
ALTER TABLE wa_messages ADD COLUMN content_json  TEXT;
ALTER TABLE wa_messages ADD COLUMN template_name TEXT;
ALTER TABLE wa_messages ADD COLUMN media_id      TEXT;

CREATE INDEX IF NOT EXISTS idx_wm_msgid    ON wa_messages(wa_message_id);
CREATE INDEX IF NOT EXISTS idx_wm_media    ON wa_messages(media_id);

-- ─────────────────────────────────────────────────────────────────────
-- 5. wa_messages — base schema (first-deploy idempotency)
-- ─────────────────────────────────────────────────────────────────────
-- This table has been written to by whatsapp.js since day one but never
-- had a committed schema. Adding it here so a fresh deployment works.
-- Existing deployments already have the table — CREATE IF NOT EXISTS is a no-op.
CREATE TABLE IF NOT EXISTS wa_messages (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  wa_id         TEXT NOT NULL,
  direction     TEXT NOT NULL,                   -- 'in' | 'out'
  msg_type      TEXT,
  content       TEXT,
  wa_message_id TEXT,
  content_json  TEXT,
  template_name TEXT,
  media_id      TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_wm_wa       ON wa_messages(wa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wm_dir      ON wa_messages(direction, created_at DESC);
