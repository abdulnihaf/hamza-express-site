-- Aggregator Pulse — stores metrics snapshots from Swiggy/Zomato partner portals
-- Source: Chrome extension running on VM with partner tabs open

CREATE TABLE IF NOT EXISTS aggregator_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL,        -- 'swiggy' | 'zomato'
  brand TEXT NOT NULL,           -- 'he' | 'nch'
  outlet_id TEXT NOT NULL,       -- '1342888' | '1342887' | '22632449' | '22632430'
  metric_type TEXT NOT NULL,     -- 'sales' | 'orders' | 'api_orders' | 'dom_read' | 'business-metrics' etc
  data TEXT NOT NULL,            -- JSON payload
  captured_at TEXT NOT NULL,     -- ISO timestamp from extension
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_agg_platform_brand ON aggregator_snapshots(platform, brand, captured_at);
CREATE INDEX IF NOT EXISTS idx_agg_recent ON aggregator_snapshots(captured_at);
CREATE INDEX IF NOT EXISTS idx_agg_type ON aggregator_snapshots(platform, brand, metric_type);
