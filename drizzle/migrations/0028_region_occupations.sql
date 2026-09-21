-- UPDATE 4.2: persist region occupations and expose them to the game UI.
create table if not exists public.region_occupations (
  id uuid primary key default gen_random_uuid(),
  region_id uuid not null references public.regions(id) on delete cascade,
  previous_country_id uuid not null references public.countries(id) on delete cascade,
  current_country_id uuid not null references public.countries(id) on delete cascade,
  occupied_at timestamptz not null default now()
);

create index if not exists region_occupations_region_id_idx
  on public.region_occupations(region_id);

create index if not exists region_occupations_previous_country_id_idx
  on public.region_occupations(previous_country_id);

create index if not exists region_occupations_current_country_id_idx
  on public.region_occupations(current_country_id);

create index if not exists region_occupations_occupied_at_idx
  on public.region_occupations(occupied_at desc);

alter table public.region_occupations enable row level security;

drop policy if exists region_occupations_authenticated_read
  on public.region_occupations;

create policy region_occupations_authenticated_read
  on public.region_occupations
  for select
  to authenticated
  using (true);

create or replace function public.admin_occupy_region(
  p_region_id uuid,
  p_new_country_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_role text;
  v_old uuid;
begin
  select role::text
  into v_role
  from public.user_roles
  where user_id = auth.uid()
    and role in ('ADMIN','MAIN_ADMIN')
  order by role desc
  limit 1;

  if v_role is null then
    raise exception 'Brak uprawnień administratora';
  end if;

  select country_id
  into v_old
  from public.regions
  where id = p_region_id
  for update;

  if v_old is null then
    raise exception 'Nie znaleziono regionu';
  end if;

  if v_old = p_new_country_id then
    raise exception 'Region już należy do tego państwa';
  end if;

  if not exists (
    select 1
    from public.countries
    where id = p_new_country_id
  ) then
    raise exception 'Nie znaleziono kraju przejmującego';
  end if;

  update public.regions
  set country_id = p_new_country_id
  where id = p_region_id;

  insert into public.region_occupations(
    region_id,
    previous_country_id,
    current_country_id,
    occupied_at
  )
  values (
    p_region_id,
    v_old,
    p_new_country_id,
    now()
  );

  insert into public.admin_actions(
    action,
    country_id,
    details,
    actor_id
  )
  values(
    'OCCUPY_REGION',
    p_new_country_id,
    jsonb_build_object(
      'region_id', p_region_id,
      'previous_country_id', v_old,
      'new_country_id', p_new_country_id,
      'occupied_at', now()
    ),
    auth.uid()
  );

  return jsonb_build_object(
    'ok', true,
    'previous_country_id', v_old,
    'new_country_id', p_new_country_id
  );
end;
$function$;

grant execute on function public.admin_occupy_region(uuid,uuid) to authenticated;

notify pgrst, 'reload schema';
