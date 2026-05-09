-- Hamza Express — Media Vault Phase 2b: Google Drive permanent archive
-- Run: wrangler d1 execute he-whatsapp --remote --file=schema-media-vault-drive.sql
--
-- R2 lifecycle deletes objects after 30 days to stay free-tier. Before
-- that deletion, a nightly cron (/api/media-mirror) uploads every 'ok'
-- row to the user's personal Google Drive (2 TB available). When a user
-- later views media older than 30 days, /api/media/[id] falls back to
-- Drive and streams the bytes via Drive API.
--
-- Drive layout:
--   {GOOGLE_DRIVE_ROOT_FOLDER_ID}/YYYY-MM-DD/{media_id}{ext}
--
-- Idempotent: mirror query is WHERE drive_file_id IS NULL, so re-running
-- the cron won't re-upload.

ALTER TABLE wa_media_files ADD COLUMN drive_file_id     TEXT;
ALTER TABLE wa_media_files ADD COLUMN drive_web_link    TEXT;  -- https://drive.google.com/file/d/...
ALTER TABLE wa_media_files ADD COLUMN drive_folder_path TEXT;  -- HE-WhatsApp-Media/YYYY-MM-DD
ALTER TABLE wa_media_files ADD COLUMN drive_uploaded_at TEXT;  -- ISO timestamp
ALTER TABLE wa_media_files ADD COLUMN drive_error       TEXT;

-- Helps the mirror cron find the next batch fast.
CREATE INDEX IF NOT EXISTS idx_wmf_drive_pending
  ON wa_media_files(downloaded_at)
  WHERE drive_file_id IS NULL AND download_status = 'ok';
