-- Source links for WhatsApp inflow tracking
-- Each row = one redirect at hamzaexpress.in/go/{slug}
CREATE TABLE IF NOT EXISTS source_links (
  slug TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'organic',
  prefill_text TEXT NOT NULL,
  clicks INTEGER DEFAULT 0,
  updated_at TEXT NOT NULL
);

-- Seed all 15 sources
INSERT OR REPLACE INTO source_links (slug, label, category, prefill_text, updated_at) VALUES
  ('google', 'Google Business Profile / Maps', 'organic', 'Hi from Google', datetime('now')),
  ('website', 'hamzaexpress.in', 'organic', 'Hi from Website', datetime('now')),
  ('instagram', 'Instagram Bio / Content', 'organic', 'Hi from Instagram', datetime('now')),
  ('facebook', 'Facebook Page / Content', 'organic', 'Hi from Facebook', datetime('now')),
  ('google-post', 'Google Posts CTA', 'organic', 'Hi from Google Post', datetime('now')),
  ('packaging', 'Swiggy/Zomato Packaging QR', 'organic', 'Hi from Packaging', datetime('now')),
  ('outlet', 'Outlet Table Tent / Standee', 'organic', 'Hi from Outlet', datetime('now')),
  ('flyer', 'Print Card / Flyer', 'organic', 'Hi from Flyer', datetime('now')),
  ('wa-status', 'WhatsApp Status', 'organic', 'Hi from Status', datetime('now')),
  ('meta-ad', 'Meta Ad - Awareness', 'inorganic', 'Hi from Ad', datetime('now')),
  ('meta-offer', 'Meta Ad - Crave/Offer', 'inorganic', 'I saw your offer', datetime('now')),
  ('google-ad', 'Google Search Ad', 'inorganic', 'Hi from Google Ad', datetime('now')),
  ('broadcast', 'WABA Marketing Broadcast', 'inorganic', 'Hi from Broadcast', datetime('now')),
  ('win-back', 'WABA Re-engagement', 'inorganic', 'Hi from Win Back', datetime('now')),
  ('influencer', 'Influencer / Creator', 'inorganic', 'Hi from Creator', datetime('now'));
