-- Additive migration: existing YouTube channels, analytics and OAuth are preserved.
-- URLs arrive through already-used YouTube channels.list(part=snippet,statistics).
ALTER TABLE channels ADD COLUMN thumbnail_url TEXT;
