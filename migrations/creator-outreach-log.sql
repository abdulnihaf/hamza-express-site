-- creator_outreach_log — tracks each manual outreach send so the /ops/creator-outreach
-- dashboard can show progress (40/40 IG sent, etc) without double-sending.
--
-- One row per (handle, channel) is the idempotent unit; subsequent clicks update
-- the row instead of inserting. Each row also records reply state so the owner
-- can mark "they replied / they applied / nothing yet".

CREATE TABLE IF NOT EXISTS creator_outreach_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  handle        TEXT NOT NULL,
  channel       TEXT NOT NULL CHECK(channel IN ('ig','wa','email')),
  -- send state
  sent_at       TEXT,
  sent_by       TEXT,                 -- always 'owner' for the manual flow today
  send_count    INTEGER NOT NULL DEFAULT 0,
  -- engagement state (owner-marked)
  reply_state   TEXT NOT NULL DEFAULT 'none',  -- none | replied | applied | declined | bounced
  reply_at      TEXT,
  notes         TEXT,
  -- snapshot of what was sent
  snapshot_text TEXT,                 -- the actual message body fired (for audit)
  contact_value TEXT,                 -- phone/email/handle that was used
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(handle, channel)
);

CREATE INDEX IF NOT EXISTS idx_outreach_handle ON creator_outreach_log(handle);
CREATE INDEX IF NOT EXISTS idx_outreach_channel ON creator_outreach_log(channel, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_outreach_reply ON creator_outreach_log(reply_state, updated_at DESC);
