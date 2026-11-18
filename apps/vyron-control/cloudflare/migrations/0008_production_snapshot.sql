-- Additive D1 production mirror, no existing tables modified.
CREATE TABLE IF NOT EXISTS production_sync (device_id TEXT PRIMARY KEY NOT NULL,source TEXT NOT NULL,generation TEXT NOT NULL,captured_at TEXT NOT NULL,received_at TEXT NOT NULL,item_count INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS production_jobs (device_id TEXT NOT NULL,id TEXT NOT NULL,channel_id TEXT NOT NULL,status TEXT NOT NULL,title TEXT NOT NULL,progress INTEGER,planned_publish_at TEXT,created_at TEXT,schedule_source TEXT NOT NULL DEFAULT 'MAC_LOCAL_UNVERIFIED',active INTEGER NOT NULL DEFAULT 1,generation TEXT NOT NULL,received_at TEXT NOT NULL,PRIMARY KEY(device_id,id));
CREATE INDEX IF NOT EXISTS idx_production_active ON production_jobs(active,channel_id,status);
CREATE INDEX IF NOT EXISTS idx_production_planned ON production_jobs(channel_id,planned_publish_at);
