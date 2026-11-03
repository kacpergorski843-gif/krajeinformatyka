-- Permanently associate a browser installation with the first account that signs in.
-- The client-generated UUID is stored in localStorage; this is not a hardware identifier.
create table if not exists public.device_account_bindings (
  device_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.device_account_bindings enable row level security;
revoke all on table public.device_account_bindings from anon, authenticated;
grant all on table public.device_account_bindings to service_role;

create or replace function public.claim_device(p_device_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_bound_user_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  insert into public.device_account_bindings (device_id, user_id)
  values (p_device_id, v_user_id)
  on conflict (device_id) do nothing;

  select user_id into v_bound_user_id
  from public.device_account_bindings
  where device_id = p_device_id;

  return v_bound_user_id = v_user_id;
end;
$$;

revoke all on function public.claim_device(uuid) from public, anon;
grant execute on function public.claim_device(uuid) to authenticated, service_role;
