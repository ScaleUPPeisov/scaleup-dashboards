drop policy if exists "vyron mobile sync own receipt update" on public.vyron_mobile_sync_events;

create policy "vyron mobile sync own receipt update"
on public.vyron_mobile_sync_events
for update to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and (
    mobile_device_id is null
    or exists (
      select 1
      from public.vyron_mobile_devices d
      where d.id = mobile_device_id
        and d.owner_id = (select auth.uid())
        and d.device_kind = 'mobile'
    )
  )
);
