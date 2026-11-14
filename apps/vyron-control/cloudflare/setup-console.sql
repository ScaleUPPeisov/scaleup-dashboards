-- VYRON CONTROL: initial one-paste schema for Cloudflare D1 Console.
-- Generated from the six migrations in this exact branch.
-- Safe on a newly created EMPTY database. No real credentials or data.
-- Once deployed, Wrangler migrations can run idempotently using IF NOT EXISTS.

-- ===== 0001_init.sql =====
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

-- ===== 0002_analytics.sql =====
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

-- ===== 0006_analytics_reports.sql =====
-- Read-only aggregate YouTube Analytics breakdowns (no viewer-level records).
CREATE TABLE IF NOT EXISTS channel_analytics_reports (
  channel_id TEXT PRIMARY KEY NOT NULL,
  reports_json TEXT NOT NULL DEFAULT '{}',
  captured_at TEXT NOT NULL,
  received_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_channel_analytics_reports_captured
  ON channel_analytics_reports(captured_at DESC);

-- ===== 0003_google_oauth.sql =====
-- VYRON CONTROL Google OAuth for read-only YouTube Analytics.
-- Credentials are AES-256-GCM encrypted by a Cloudflare *secret* key not in D1.
-- Native tokens are imported only from an explicit password-protected VYRON
-- migration bundle; the bundle password never leaves the owner's browser.
CREATE TABLE IF NOT EXISTS google_oauth_sessions (
 state_hash TEXT PRIMARY KEY NOT NULL,
 verifier_cipher TEXT NOT NULL,
 created_at TEXT NOT NULL,
 expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS google_oauth_profiles (
 channel_id TEXT PRIMARY KEY NOT NULL,
 channel_name TEXT NOT NULL,
 refresh_token_cipher TEXT NOT NULL,
 granted_scope TEXT NOT NULL,
 connected_at TEXT NOT NULL,
 last_success_at TEXT,
 last_error TEXT
);

-- ===== 0005_vyron_oauth_import.sql =====
CREATE TABLE IF NOT EXISTS google_oauth_client_credentials (
  channel_id TEXT PRIMARY KEY NOT NULL,
  profile_uuid TEXT NOT NULL,
  client_id_cipher TEXT NOT NULL,
  client_secret_cipher TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'VYRON_MIGRATION',
  bundle_uuid TEXT NOT NULL,
  imported_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cloud_analytics_runs (
 slot TEXT PRIMARY KEY NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('running','success','error')),
 started_at TEXT NOT NULL,
 ended_at TEXT,
 updated_channels INTEGER DEFAULT 0,
 error TEXT
);

-- ===== 0004_webpush.sql =====
-- Web Push is opt-in; delivery attempts are independently deduplicated.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint_hash TEXT PRIMARY KEY NOT NULL,
  subscription_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS push_deliveries (
  endpoint_hash TEXT NOT NULL,
  event_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'retry' CHECK(status IN ('retry','sending','sent','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(endpoint_hash,event_id)
);
CREATE INDEX IF NOT EXISTS idx_push_deliveries_retry ON push_deliveries(status,updated_at);

-- Check installed tables. Expected application tables: 15.
SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name;
