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
