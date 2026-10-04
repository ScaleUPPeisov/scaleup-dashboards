alter table public.vyron_mobile_channel_stats
  add column if not exists period_days integer not null default 28 check (period_days in (7,28,90)),
  add column if not exists views_period bigint,
  add column if not exists subscriber_delta_period bigint;
create index if not exists vyron_mobile_channel_stats_period_idx
  on public.vyron_mobile_channel_stats(owner_id, period_days, timestamp desc);
