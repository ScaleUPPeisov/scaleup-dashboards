-- Read-only YouTube scheduled-video discovery, additive and non-destructive.
CREATE TABLE IF NOT EXISTS channel_schedule (
 channel_id TEXT PRIMARY KEY NOT NULL,
 status TEXT NOT NULL DEFAULT 'PENDING',
 confirmed_json TEXT NOT NULL DEFAULT '[]',
 scanned_count INTEGER NOT NULL DEFAULT 0,
 complete INTEGER NOT NULL DEFAULT 0,
 captured_at TEXT,
 last_error TEXT,
 next_refresh_at TEXT,
 updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_channel_schedule_due ON channel_schedule(next_refresh_at,status);
