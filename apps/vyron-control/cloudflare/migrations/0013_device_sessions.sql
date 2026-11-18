-- New owner browser sessions only; existing channels, OAuth and analytics stay unchanged.
CREATE TABLE IF NOT EXISTS device_sessions (
 id TEXT PRIMARY KEY NOT NULL,
 token_hash TEXT NOT NULL UNIQUE,
 device_label TEXT NOT NULL,
 created_at TEXT NOT NULL,
 last_seen_at TEXT NOT NULL,
 expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_device_sessions_expiry ON device_sessions(expires_at,last_seen_at);
