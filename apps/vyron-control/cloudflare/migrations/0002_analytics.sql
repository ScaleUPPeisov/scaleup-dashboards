-- Read-only analytics snapshots from authorized Mac VYRON cache.
-- No OAuth refresh tokens or Google credentials are persisted here.
CREATE TABLE IF NOT EXISTS channel_analytics (
  channel_id TEXT PRIMARY KEY NOT NULL,
  period_days INTEGER NOT NULL,
  views INTEGER,
  watch_minutes REAL,
  avg_view_seconds REAL,
  avg_view_percentage REAL,
  subscribers_gained INTEGER,
  subscribers_lost INTEGER,
  impressions INTEGER,
  impression_ctr REAL,
  estimated_revenue REAL,
  currency TEXT,
  daily_json TEXT NOT NULL DEFAULT '[]',
  captured_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'VYRON_MAC_CACHE'
);
CREATE INDEX IF NOT EXISTS idx_channel_analytics_received ON channel_analytics(received_at DESC);
