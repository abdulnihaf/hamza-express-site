-- Phase 3a of message-architecture rollout
-- Run: wrangler d1 execute he-whatsapp --remote --file=schema-escalation.sql
-- See BUILD-PLAN-MESSAGE-ARCH.md and /ops/message-architecture/

-- Bot-pause gate: when a customer conversation is handed to a human,
-- the bot stops routing and every inbound message is just logged.
-- paused_until gives an auto-resume safety net (24h default).
-- assigned_to is the hr_employees.id of whoever currently owns the case.
ALTER TABLE wa_sessions ADD COLUMN bot_paused INTEGER DEFAULT 0;
ALTER TABLE wa_sessions ADD COLUMN paused_until TEXT;
ALTER TABLE wa_sessions ADD COLUMN paused_reason TEXT;
ALTER TABLE wa_sessions ADD COLUMN assigned_to INTEGER;

-- Escalation cascade: Faheem (tier 1) -> Basheer (tier 2) -> Nihaf (tier 3).
-- A row is 'active' while the cascade is running. First /api/agent-reply from
-- any tier flips it to 'claimed' and stops further pings.
CREATE TABLE IF NOT EXISTS escalations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wa_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  tier INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active',
  claimed_by INTEGER,
  claimed_at TEXT,
  last_pinged_tier INTEGER,
  next_escalate_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  context_snapshot TEXT
);

CREATE INDEX IF NOT EXISTS idx_escalations_status ON escalations (status, next_escalate_at);
CREATE INDEX IF NOT EXISTS idx_escalations_wa_id ON escalations (wa_id);

-- Audit log for agent actions (who replied when, who released the bot, etc.)
-- Separate from the existing lead_audit to keep per-case history tight.
CREATE TABLE IF NOT EXISTS agent_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wa_id TEXT NOT NULL,
  hr_id INTEGER,
  action TEXT NOT NULL,
  details TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agent_actions_wa_id ON agent_actions (wa_id, created_at);
