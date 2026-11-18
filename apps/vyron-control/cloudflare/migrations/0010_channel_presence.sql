-- Versioned authoritative Mac channel presence. Never deletes channels, analytics or OAuth.
CREATE TABLE IF NOT EXISTS channel_presence (
  channel_id TEXT PRIMARY KEY NOT NULL,
  device_id TEXT NOT NULL,
  generation TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  archived_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_channel_presence_device ON channel_presence(device_id,archived_at);
