alter table public.vyron_mobile_channels add column if not exists last_event_id uuid;
alter table public.vyron_mobile_projects add column if not exists last_event_id uuid;
alter table public.vyron_mobile_content_inventory add column if not exists last_event_id uuid;
alter table public.vyron_mobile_publisher_jobs add column if not exists last_event_id uuid;
alter table public.vyron_mobile_endlume_jobs add column if not exists last_event_id uuid;
alter table public.vyron_mobile_notifications add column if not exists source_event_id uuid;

create index if not exists vyron_mobile_channels_event_idx on public.vyron_mobile_channels(last_event_id);
create index if not exists vyron_mobile_projects_event_idx on public.vyron_mobile_projects(last_event_id);
create index if not exists vyron_mobile_inventory_event_idx on public.vyron_mobile_content_inventory(last_event_id);
create index if not exists vyron_mobile_publisher_event_idx on public.vyron_mobile_publisher_jobs(last_event_id);
create index if not exists vyron_mobile_endlume_event_idx on public.vyron_mobile_endlume_jobs(last_event_id);
