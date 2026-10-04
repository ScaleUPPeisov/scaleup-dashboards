alter table public.vyron_mobile_sync_events
  add column if not exists applied_at timestamptz,
  add column if not exists apply_error text;
create index if not exists vyron_mobile_sync_events_unapplied_idx
  on public.vyron_mobile_sync_events(owner_id, server_write_at)
  where applied_at is null;
