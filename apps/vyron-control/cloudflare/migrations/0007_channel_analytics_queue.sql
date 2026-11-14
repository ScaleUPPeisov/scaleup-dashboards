CREATE TABLE IF NOT EXISTS channel_analytics_queue (
  channel_id TEXT PRIMARY KEY NOT NULL,
  queued_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
  last_attempt_at TEXT,
  last_error TEXT,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_channel_analytics_queue_pending
  ON channel_analytics_queue(completed_at,queued_at);
