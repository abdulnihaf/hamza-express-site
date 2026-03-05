CREATE TABLE IF NOT EXISTS qr_links (
  slug TEXT PRIMARY KEY,
  prefill_text TEXT NOT NULL,
  counter_key TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Seed with current stations
INSERT OR IGNORE INTO qr_links (slug, prefill_text, counter_key, updated_at) VALUES
  ('bm', 'Order from Bain Marie counter', 'bm_counter', datetime('now')),
  ('juice', 'Order from Juice counter', 'juice_counter', datetime('now')),
  ('shawarma', 'Order from Shawarma counter', 'shawarma_counter', datetime('now')),
  ('grill', 'Order from Grill counter', 'grill_counter', datetime('now')),
  ('sheek', 'Order from Sheek Kabab counter', 'sheek_counter', datetime('now'));
