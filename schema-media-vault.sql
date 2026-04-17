-- Hamza Express — Media Vault (Wave 3.0 Phase 2)
-- Run: wrangler d1 execute he-whatsapp --remote --file=schema-media-vault.sql
--
-- Purpose: Meta's media URLs die in ~5 minutes. Once expired, the bytes are
-- gone — not on Meta's side, not on ours. Customers send us photos of
-- packaging, receipts, damaged goods, voice notes with detailed context.
-- Without this table + R2 bucket, every inbound media message is a black
-- box after the first 5 minutes.
--
-- Pipeline (async, fire-and-forget via ctx.waitUntil):
--   inbound msg w/ media → extract media_id → GET /v21.0/{media_id} for
--   pre-signed URL → download bytes w/ Bearer token → PUT to R2 under
--   wa-media/YYYY/MM/DD/{media_id}.{ext} → INSERT row in wa_media_files.
--
-- Retry safety: webhook retries from Meta would re-trigger the same
-- media_id. Unique constraint on media_id prevents double-storage.

CREATE TABLE IF NOT EXISTS wa_media_files (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  media_id        TEXT    UNIQUE NOT NULL,         -- Meta's media id (stable)
  wa_message_id   TEXT,                            -- wamid.xxx of the message that carried it
  wa_id           TEXT,                            -- customer wa_id (indexing)
  msg_type        TEXT,                            -- image | video | audio | document | sticker
  mime_type       TEXT,
  size_bytes      INTEGER,
  sha256          TEXT,                            -- Meta's sha256 (verifies integrity)
  filename        TEXT,                            -- for 'document' type
  r2_key          TEXT,                            -- key in R2 bucket; NULL if download failed
  download_status TEXT    NOT NULL DEFAULT 'pending',  -- pending | ok | failed | expired
  attempts        INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT,
  downloaded_at   TEXT,                            -- ISO timestamp when bytes landed in R2
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_wmf_wa         ON wa_media_files(wa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wmf_msg        ON wa_media_files(wa_message_id);
CREATE INDEX IF NOT EXISTS idx_wmf_status     ON wa_media_files(download_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wmf_type       ON wa_media_files(msg_type, created_at DESC);
