create policy "vyron mobile credentials deny clients"
on public.vyron_mobile_device_credentials
for all to anon, authenticated
using (false) with check (false);

create policy "vyron mobile license links deny clients"
on public.vyron_mobile_license_links
for all to anon, authenticated
using (false) with check (false);

create policy "vyron mobile pairing deny clients"
on public.vyron_mobile_pairing_codes
for all to anon, authenticated
using (false) with check (false);
