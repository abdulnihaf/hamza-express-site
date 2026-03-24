-- HE Organic Marketing — Review Snapshots
-- Run: wrangler d1 execute he-db --remote --file=migrations/organic-reviews.sql

CREATE TABLE IF NOT EXISTS review_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brand TEXT NOT NULL DEFAULT 'he',
  snapshot_date TEXT NOT NULL,
  total_reviews INTEGER,
  average_rating REAL,
  stars_5 INTEGER DEFAULT 0,
  stars_4 INTEGER DEFAULT 0,
  stars_3 INTEGER DEFAULT 0,
  stars_2 INTEGER DEFAULT 0,
  stars_1 INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(brand, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_rs_date ON review_snapshots(brand, snapshot_date);
