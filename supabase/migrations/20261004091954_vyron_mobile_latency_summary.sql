create or replace view public.vyron_mobile_sync_latency_summary
with (security_invoker=true)
as
select
  owner_id,
  event_type,
  count(*) filter (where mobile_paint_at is not null) as measured_events,
  round(percentile_cont(0.50) within group (order by desktop_to_mobile_paint_ms) filter (where desktop_to_mobile_paint_ms is not null)::numeric, 2) as p50_ms,
  round(percentile_cont(0.95) within group (order by desktop_to_mobile_paint_ms) filter (where desktop_to_mobile_paint_ms is not null)::numeric, 2) as p95_ms,
  round(max(desktop_to_mobile_paint_ms), 2) as max_ms
from public.vyron_mobile_sync_latency
group by owner_id,event_type;

revoke all on public.vyron_mobile_sync_latency_summary from anon;
grant select on public.vyron_mobile_sync_latency_summary to authenticated;
