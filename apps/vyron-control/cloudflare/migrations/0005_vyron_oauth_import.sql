CREATE TABLE IF NOT EXISTS google_oauth_client_credentials (
  channel_id TEXT PRIMARY KEY NOT NULL,
  profile_uuid TEXT NOT NULL,
  client_id_cipher TEXT NOT NULL,
  client_secret_cipher TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'VYRON_MIGRATION',
  bundle_uuid TEXT NOT NULL,
  imported_at TEXT NOT NULL
);
