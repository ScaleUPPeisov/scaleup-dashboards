-- Additive owner notification preferences + read receipts. No existing push keys changed.
CREATE TABLE IF NOT EXISTS notification_preferences (
  id TEXT PRIMARY KEY NOT NULL DEFAULT 'owner',
  categories_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notification_reads (
  event_id TEXT PRIMARY KEY NOT NULL,
  read_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notification_reads_at ON notification_reads(read_at DESC);
