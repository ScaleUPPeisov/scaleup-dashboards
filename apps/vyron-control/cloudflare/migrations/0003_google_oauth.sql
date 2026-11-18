-- VYRON CONTROL Google OAuth for read-only YouTube Analytics.
-- Credentials are AES-256-GCM encrypted by a Cloudflare *secret* key not in D1.
-- Tokens from the existing VYRON macOS Keychain must never be imported.
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
CREATE TABLE IF NOT EXISTS cloud_analytics_runs (
 slot TEXT PRIMARY KEY NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('running','success','error')),
 started_at TEXT NOT NULL,
 ended_at TEXT,
 updated_channels INTEGER DEFAULT 0,
 error TEXT
);
