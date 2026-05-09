-- Hamza Express — Clip Intelligence & Reels Engine
-- Run: wrangler d1 execute hamza-express-db --file=schema-clips.sql

CREATE TABLE IF NOT EXISTS clips (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  filename TEXT NOT NULL,
  duration_s REAL,
  resolution TEXT,
  tags TEXT NOT NULL,
  description TEXT,
  viral_score INTEGER DEFAULT 5,
  added_at TEXT DEFAULT (datetime('now')),
  thumbnail_url TEXT
);

CREATE TABLE IF NOT EXISTS reels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  concept TEXT,
  clip_sequence TEXT NOT NULL,
  duration_s REAL,
  status TEXT DEFAULT 'draft',
  export_path TEXT,
  ig_media_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  published_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_clips_source ON clips(source);
CREATE INDEX IF NOT EXISTS idx_clips_viral ON clips(viral_score DESC);
CREATE INDEX IF NOT EXISTS idx_reels_status ON reels(status);
