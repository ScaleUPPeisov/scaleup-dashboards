-- Private read-only YouTube Analytics breakdowns per channel.
-- Only aggregate report rows are stored; OAuth tokens remain in the encrypted vault table.
CREATE TABLE IF NOT EXISTS channel_analytics_reports (
  channel_id TEXT PRIMARY KEY NOT NULL,
  reports_json TEXT NOT NULL DEFAULT '{}',
  captured_at TEXT NOT NULL,
  received_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_channel_analytics_reports_captured
  ON channel_analytics_reports(captured_at DESC);
