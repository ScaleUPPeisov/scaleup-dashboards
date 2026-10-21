create or replace view public.vyron_mobile_sync_latency
with (security_invoker=true)
as
select
  event_id,
  owner_id,
  event_type,
  entity_type,
  entity_key,
  desktop_event_at,
  server_write_at,
  mobile_receive_at,
  mobile_paint_at,
  round((extract(epoch from (server_write_at-desktop_event_at))*1000)::numeric,2) as desktop_to_server_ms,
  case when mobile_receive_at is not null then round((extract(epoch from (mobile_receive_at-server_write_at))*1000)::numeric,2) end as server_to_mobile_receive_ms,
  case when mobile_receive_at is not null and mobile_paint_at is not null then round((extract(epoch from (mobile_paint_at-mobile_receive_at))*1000)::numeric,2) end as mobile_receive_to_paint_ms,
  case when mobile_paint_at is not null then round((extract(epoch from (mobile_paint_at-desktop_event_at))*1000)::numeric,2) end as desktop_to_mobile_paint_ms
from public.vyron_mobile_sync_events;

revoke all on public.vyron_mobile_sync_latency from anon;
grant select on public.vyron_mobile_sync_latency to authenticated;
