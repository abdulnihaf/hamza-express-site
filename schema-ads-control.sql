-- Hamza Express — Ads Control Audit Log
-- Run: wrangler d1 execute he-whatsapp --remote --file=schema-ads-control.sql
-- Purpose: Immutable audit trail for every pause/resume/budget/bid/negative change
--          pushed through /api/ads-control across Meta + Google.

CREATE TABLE IF NOT EXISTS ads_control_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ts          TEXT    NOT NULL DEFAULT (datetime('now')),
  platform    TEXT    NOT NULL,           -- 'meta' | 'google'
  action      TEXT    NOT NULL,           -- pause|resume|budget|bid|negative
  resource_id TEXT,                       -- campaign/adset/adgroup/criterion ID
  before_val  TEXT,                       -- previous value as JSON string
  after_val   TEXT,                       -- new value as JSON string
  actor       TEXT,                       -- who triggered (Basheer/Faheem/Nihaf)
  reason      TEXT,                       -- optional note
  success     INTEGER NOT NULL DEFAULT 1, -- 1=ok, 0=failed
  error       TEXT,                       -- error message if failed
  response    TEXT                        -- raw API response JSON (truncated)
);

CREATE INDEX IF NOT EXISTS idx_ads_control_ts       ON ads_control_log(ts DESC);
CREATE INDEX IF NOT EXISTS idx_ads_control_platform ON ads_control_log(platform, ts DESC);
CREATE INDEX IF NOT EXISTS idx_ads_control_action   ON ads_control_log(action, ts DESC);
