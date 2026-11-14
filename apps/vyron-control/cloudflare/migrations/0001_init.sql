-- VYRON CONTROL Cloudflare D1 v1.
-- No OAuth, Google secrets or macOS Keychain values in this database.
CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  subscribers INTEGER,
  views INTEGER,
  videos INTEGER,
  hidden_subscribers INTEGER DEFAULT 0,
  max_milestone INTEGER,
  previous_subscribers INTEGER,
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS channel_snapshots (
  channel_id TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  subscribers INTEGER,
  views INTEGER,
  videos INTEGER,
  PRIMARY KEY(channel_id, observed_at)
);
CREATE INDEX IF NOT EXISTS idx_snapshots_at ON channel_snapshots(observed_at);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL,
  channel_id TEXT,
  title TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL,
  received_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_received ON events(received_at DESC);
CREATE TABLE IF NOT EXISTS sync_runs (
  slot TEXT PRIMARY KEY NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('running','success','error')),
  source TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  error TEXT,
  updated_channels INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sync_runs_started ON sync_runs(started_at DESC);
CREATE TABLE IF NOT EXISTS quota_buckets (
  day_pt TEXT PRIMARY KEY NOT NULL,
  spent INTEGER NOT NULL DEFAULT 0 CHECK(spent >= 0)
);
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY NOT NULL,
  label TEXT NOT NULL,
  last_seen_at TEXT,
  status_json TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS commands (
  id TEXT PRIMARY KEY NOT NULL,
  target_device TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','accepted','completed','failed','cancelled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  result_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_commands_pending ON commands(target_device,state,created_at);
