-- Hamza Express — Clip Intelligence Migration
-- Run: wrangler d1 execute he-whatsapp --remote --file=schema-clip-intelligence.sql

-- Per-clip composition intelligence
ALTER TABLE clips ADD COLUMN subject_x REAL DEFAULT 0.5;
ALTER TABLE clips ADD COLUMN subject_y REAL DEFAULT 0.5;
ALTER TABLE clips ADD COLUMN crop_gravity TEXT DEFAULT 'center';
ALTER TABLE clips ADD COLUMN brightness INTEGER DEFAULT 50;
ALTER TABLE clips ADD COLUMN has_good_audio INTEGER DEFAULT 0;
ALTER TABLE clips ADD COLUMN audio_type TEXT DEFAULT 'noise';
ALTER TABLE clips ADD COLUMN width_px INTEGER;
ALTER TABLE clips ADD COLUMN height_px INTEGER;
ALTER TABLE clips ADD COLUMN quality_flag TEXT DEFAULT 'ok';
ALTER TABLE clips ADD COLUMN analyzed_at TEXT;

-- Per-reel intelligence
ALTER TABLE reels ADD COLUMN audio_profile TEXT DEFAULT 'default';
ALTER TABLE reels ADD COLUMN color_preset TEXT DEFAULT 'warm_restaurant';
