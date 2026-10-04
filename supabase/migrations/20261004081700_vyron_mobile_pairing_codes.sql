create table if not exists public.vyron_mobile_pairing_codes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  claimed_at timestamptz,
  claimed_device_id uuid references public.vyron_mobile_devices(id) on delete set null
);
alter table public.vyron_mobile_pairing_codes enable row level security;
revoke all on public.vyron_mobile_pairing_codes from anon, authenticated;
create index if not exists vyron_mobile_pairing_owner_idx on public.vyron_mobile_pairing_codes(owner_id);
create index if not exists vyron_mobile_pairing_expiry_idx on public.vyron_mobile_pairing_codes(expires_at);
