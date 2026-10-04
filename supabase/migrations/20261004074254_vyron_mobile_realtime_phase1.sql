create table if not exists public.vyron_mobile_users (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vyron_mobile_devices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  device_id text not null,
  name text not null,
  platform text not null check (platform in ('macos','windows','ios','android','unknown')),
  app_version text not null default '',
  architecture text,
  device_kind text not null default 'mobile' check (device_kind in ('desktop','mobile')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, device_id)
);

create table if not exists public.vyron_mobile_device_credentials (
  device_id uuid primary key references public.vyron_mobile_devices(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  rotated_at timestamptz,
  revoked_at timestamptz
);

create table if not exists public.vyron_mobile_license_links (
  license_id uuid primary key references public.vyron_licenses(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(owner_id, license_id)
);

create table if not exists public.vyron_mobile_channels (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  desktop_channel_id text not null,
  youtube_channel_id text,
  name text not null,
  avatar_url text,
  status text not null default 'active',
  source_created_at timestamptz,
  source_updated_at timestamptz,
  last_sync_at timestamptz not null default now(),
  device_id uuid references public.vyron_mobile_devices(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, desktop_channel_id)
);

create table if not exists public.vyron_mobile_channel_stats (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  channel_id uuid not null references public.vyron_mobile_channels(id) on delete cascade,
  source_event_id uuid,
  timestamp timestamptz not null,
  subscriber_count bigint,
  subscriber_delta_today bigint,
  subscriber_delta_7d bigint,
  subscriber_delta_28d bigint,
  views_total bigint,
  views_today bigint,
  views_7d bigint,
  views_28d bigint,
  video_count bigint,
  watch_time numeric,
  ctr numeric,
  average_view_duration numeric,
  last_published_at timestamptz,
  daily_points jsonb not null default '[]'::jsonb,
  traffic_sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create unique index if not exists vyron_mobile_channel_stats_event_uidx
  on public.vyron_mobile_channel_stats(owner_id, source_event_id)
  where source_event_id is not null;
create index if not exists vyron_mobile_channel_stats_channel_time_idx
  on public.vyron_mobile_channel_stats(channel_id, timestamp desc);

create table if not exists public.vyron_mobile_projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  desktop_project_id text not null,
  channel_id uuid references public.vyron_mobile_channels(id) on delete set null,
  project_name text not null,
  status text not null check (status in ('READY_RENDER','RENDERING','COMPLETED','ERROR','QUEUED')),
  progress numeric check (progress is null or (progress >= 0 and progress <= 100)),
  track_count integer,
  duration_seconds numeric,
  machine text,
  source_created_at timestamptz,
  source_updated_at timestamptz,
  error_message text,
  last_sync_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, desktop_project_id)
);

create table if not exists public.vyron_mobile_project_status (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.vyron_mobile_projects(id) on delete cascade,
  source_event_id uuid,
  status text not null check (status in ('READY_RENDER','RENDERING','COMPLETED','ERROR','QUEUED')),
  progress numeric check (progress is null or (progress >= 0 and progress <= 100)),
  error_message text,
  timestamp timestamptz not null,
  created_at timestamptz not null default now()
);
create unique index if not exists vyron_mobile_project_status_event_uidx
  on public.vyron_mobile_project_status(owner_id, source_event_id)
  where source_event_id is not null;

create table if not exists public.vyron_mobile_content_inventory (
  channel_id uuid primary key references public.vyron_mobile_channels(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  ready_video_count integer not null default 0 check (ready_video_count >= 0),
  scheduled_video_count integer not null default 0 check (scheduled_video_count >= 0),
  published_video_count integer not null default 0 check (published_video_count >= 0),
  remaining_content_days numeric check (remaining_content_days is null or remaining_content_days >= 0),
  last_local_inventory_scan timestamptz,
  next_scheduled_publication timestamptz,
  folder_state text,
  stale boolean not null default false,
  source_updated_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.vyron_mobile_publisher_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  desktop_job_id text not null,
  channel_id uuid references public.vyron_mobile_channels(id) on delete set null,
  status text not null,
  progress numeric check (progress is null or (progress >= 0 and progress <= 100)),
  scheduled_at timestamptz,
  youtube_video_id text,
  error_message text,
  source_updated_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(owner_id, desktop_job_id)
);

create table if not exists public.vyron_mobile_endlume_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  desktop_job_id text not null,
  project_id uuid references public.vyron_mobile_projects(id) on delete set null,
  state text not null check (state in ('connected','disconnected','idle','rendering','completed','failed')),
  current_project text,
  progress numeric check (progress is null or (progress >= 0 and progress <= 100)),
  last_activity timestamptz,
  machine_name text,
  error_message text,
  source_updated_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(owner_id, desktop_job_id)
);

create table if not exists public.vyron_mobile_sync_events (
  event_id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid references public.vyron_mobile_devices(id) on delete set null,
  event_type text not null,
  entity_type text not null,
  entity_key text,
  desktop_event_at timestamptz not null,
  server_write_at timestamptz not null default now(),
  mobile_receive_at timestamptz,
  mobile_paint_at timestamptz,
  mobile_device_id uuid references public.vyron_mobile_devices(id) on delete set null,
  payload_version integer not null default 1,
  created_at timestamptz not null default now()
);
create index if not exists vyron_mobile_sync_events_owner_server_idx
  on public.vyron_mobile_sync_events(owner_id, server_write_at desc);

create table if not exists public.vyron_mobile_notifications (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in (
    'render_completed','render_failed','upload_completed','upload_failed',
    'content_runway_low','content_runway_critical','publisher_error',
    'desktop_offline','endlume_disconnected'
  )),
  dedup_key text not null,
  title text not null,
  body text,
  entity_type text,
  entity_key text,
  occurred_at timestamptz not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique(owner_id, dedup_key)
);

alter table public.vyron_mobile_users enable row level security;
alter table public.vyron_mobile_devices enable row level security;
alter table public.vyron_mobile_device_credentials enable row level security;
alter table public.vyron_mobile_license_links enable row level security;
alter table public.vyron_mobile_channels enable row level security;
alter table public.vyron_mobile_channel_stats enable row level security;
alter table public.vyron_mobile_projects enable row level security;
alter table public.vyron_mobile_project_status enable row level security;
alter table public.vyron_mobile_content_inventory enable row level security;
alter table public.vyron_mobile_publisher_jobs enable row level security;
alter table public.vyron_mobile_endlume_jobs enable row level security;
alter table public.vyron_mobile_sync_events enable row level security;
alter table public.vyron_mobile_notifications enable row level security;

create policy "vyron mobile user self read" on public.vyron_mobile_users for select to authenticated using ((select auth.uid()) = id);
create policy "vyron mobile user self insert" on public.vyron_mobile_users for insert to authenticated with check ((select auth.uid()) = id);
create policy "vyron mobile user self update" on public.vyron_mobile_users for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "vyron mobile devices own read" on public.vyron_mobile_devices for select to authenticated using ((select auth.uid()) = owner_id);
create policy "vyron mobile devices own insert" on public.vyron_mobile_devices for insert to authenticated with check ((select auth.uid()) = owner_id and device_kind = 'mobile');
create policy "vyron mobile devices own mobile update" on public.vyron_mobile_devices for update to authenticated using ((select auth.uid()) = owner_id and device_kind = 'mobile') with check ((select auth.uid()) = owner_id and device_kind = 'mobile');

create policy "vyron mobile channels own read" on public.vyron_mobile_channels for select to authenticated using ((select auth.uid()) = owner_id);
create policy "vyron mobile stats own read" on public.vyron_mobile_channel_stats for select to authenticated using ((select auth.uid()) = owner_id);
create policy "vyron mobile projects own read" on public.vyron_mobile_projects for select to authenticated using ((select auth.uid()) = owner_id);
create policy "vyron mobile project status own read" on public.vyron_mobile_project_status for select to authenticated using ((select auth.uid()) = owner_id);
create policy "vyron mobile inventory own read" on public.vyron_mobile_content_inventory for select to authenticated using ((select auth.uid()) = owner_id);
create policy "vyron mobile publisher own read" on public.vyron_mobile_publisher_jobs for select to authenticated using ((select auth.uid()) = owner_id);
create policy "vyron mobile endlume own read" on public.vyron_mobile_endlume_jobs for select to authenticated using ((select auth.uid()) = owner_id);
create policy "vyron mobile sync own read" on public.vyron_mobile_sync_events for select to authenticated using ((select auth.uid()) = owner_id);
create policy "vyron mobile sync own receipt update" on public.vyron_mobile_sync_events for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "vyron mobile notifications own read" on public.vyron_mobile_notifications for select to authenticated using ((select auth.uid()) = owner_id);
create policy "vyron mobile notifications own update" on public.vyron_mobile_notifications for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

revoke all on public.vyron_mobile_device_credentials from anon, authenticated;
revoke all on public.vyron_mobile_license_links from anon, authenticated;

grant select, insert, update on public.vyron_mobile_users to authenticated;
grant select on public.vyron_mobile_channels to authenticated;
grant select on public.vyron_mobile_channel_stats to authenticated;
grant select on public.vyron_mobile_projects to authenticated;
grant select on public.vyron_mobile_project_status to authenticated;
grant select on public.vyron_mobile_content_inventory to authenticated;
grant select on public.vyron_mobile_publisher_jobs to authenticated;
grant select on public.vyron_mobile_endlume_jobs to authenticated;
grant select on public.vyron_mobile_notifications to authenticated;
grant update(read_at) on public.vyron_mobile_notifications to authenticated;
grant select on public.vyron_mobile_sync_events to authenticated;
grant update(mobile_receive_at, mobile_paint_at, mobile_device_id) on public.vyron_mobile_sync_events to authenticated;
grant select, insert on public.vyron_mobile_devices to authenticated;
grant update(name, app_version, last_seen_at, updated_at) on public.vyron_mobile_devices to authenticated;
grant usage, select on all sequences in schema public to authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'vyron_mobile_channels','vyron_mobile_channel_stats','vyron_mobile_projects',
    'vyron_mobile_project_status','vyron_mobile_content_inventory',
    'vyron_mobile_publisher_jobs','vyron_mobile_endlume_jobs',
    'vyron_mobile_sync_events','vyron_mobile_notifications','vyron_mobile_devices'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename=t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
