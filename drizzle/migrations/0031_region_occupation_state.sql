-- UPDATE 4.3: make region occupation state explicit and make occupy/revert history reliable.
revoke all on table public.region_occupations from anon;
grant select on table public.region_occupations to authenticated;

alter table public.region_occupations
  add column if not exists event_type text not null default 'OCCUPATION'
    check (event_type in ('OCCUPATION', 'REVERT'));

-- Rows created by the old revert function were reverse owner changes.
update public.region_occupations ro
set event_type = 'REVERT'
where exists (
  select 1
  from public.admin_actions aa
  where aa.action = 'REVERT_REGION_OCCUPATION'
    and aa.details->>'region_id' = ro.region_id::text
    and aa.details->>'previous_occupier_country_id' = ro.previous_country_id::text
    and aa.details->>'restored_country_id' = ro.current_country_id::text
    and ro.occupied_at >= coalesce((aa.details->>'reverted_at')::timestamptz, ro.occupied_at) - interval '5 seconds'
    and ro.occupied_at <= coalesce((aa.details->>'reverted_at')::timestamptz, ro.occupied_at) + interval '5 seconds'
);

create index if not exists region_occupations_active_idx
  on public.region_occupations(region_id, occupied_at desc)
  where event_type = 'OCCUPATION';

create or replace function public.admin_occupy_region(
  p_region_id uuid,
  p_new_country_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_role text;
  v_old uuid;
begin
  select ur.role::text
  into v_role
  from public.user_roles ur
  where ur.user_id = (select auth.uid())
    and ur.role in ('ADMIN','MAIN_ADMIN')
  order by ur.role desc
  limit 1;

  if v_role is null then
    raise exception 'Brak uprawnień administratora';
  end if;

  if p_region_id is null or p_new_country_id is null then
    raise exception 'Nieprawidłowy region lub kraj';
  end if;

  select r.country_id
  into v_old
  from public.regions r
  where r.id = p_region_id
  for update;

  if v_old is null then
    raise exception 'Nie znaleziono regionu';
  end if;

  if v_old = p_new_country_id then
    raise exception 'Region już należy do tego państwa';
  end if;

  if not exists (
    select 1
    from public.countries c
    where c.id = p_new_country_id
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
    event_type,
    occupied_at
  )
  values (
    p_region_id,
    v_old,
    p_new_country_id,
    'OCCUPATION',
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
    (select auth.uid())
  );

  return jsonb_build_object(
    'ok', true,
    'region_id', p_region_id,
    'previous_country_id', v_old,
    'new_country_id', p_new_country_id
  );
end;
$function$;

create or replace function public.admin_revert_region_occupation(p_region_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_role text;
  v_region_country_id uuid;
  v_occupier_country_id uuid;
  v_previous_country_id uuid;
  v_occupied_at timestamptz;
begin
  select ur.role::text
  into v_role
  from public.user_roles ur
  where ur.user_id = (select auth.uid())
    and ur.role in ('ADMIN','MAIN_ADMIN')
  order by ur.role desc
  limit 1;

  if v_role is null then
    raise exception 'Brak uprawnień administratora';
  end if;

  select r.country_id
  into v_region_country_id
  from public.regions r
  where r.id = p_region_id
  for update;

  if v_region_country_id is null then
    raise exception 'Nie znaleziono regionu';
  end if;

  select ro.previous_country_id, ro.current_country_id, ro.occupied_at
  into v_previous_country_id, v_occupier_country_id, v_occupied_at
  from public.region_occupations ro
  where ro.region_id = p_region_id
    and ro.event_type = 'OCCUPATION'
  order by ro.occupied_at desc
  limit 1;

  if not found then
    raise exception 'Ten region nie ma aktywnego przejęcia';
  end if;

  if v_region_country_id <> v_occupier_country_id then
    raise exception 'Stan regionu zmienił się — odśwież panel i spróbuj ponownie';
  end if;

  update public.regions
  set country_id = v_previous_country_id
  where id = p_region_id;

  insert into public.region_occupations(
    region_id,
    previous_country_id,
    current_country_id,
    event_type,
    occupied_at
  )
  values (
    p_region_id,
    v_occupier_country_id,
    v_previous_country_id,
    'REVERT',
    now()
  );

  insert into public.admin_actions(action, country_id, details, actor_id)
  values(
    'REVERT_REGION_OCCUPATION',
    v_previous_country_id,
    jsonb_build_object(
      'region_id', p_region_id,
      'previous_occupier_country_id', v_occupier_country_id,
      'restored_country_id', v_previous_country_id,
      'original_occupied_at', v_occupied_at,
      'reverted_at', now()
    ),
    (select auth.uid())
  );

  return jsonb_build_object(
    'ok', true,
    'region_id', p_region_id,
    'restored_country_id', v_previous_country_id,
    'previous_occupier_country_id', v_occupier_country_id
  );
end;
$function$;

revoke execute on function public.admin_occupy_region(uuid,uuid) from public, anon;
revoke execute on function public.admin_revert_region_occupation(uuid) from public, anon;
grant execute on function public.admin_occupy_region(uuid,uuid) to authenticated;
grant execute on function public.admin_revert_region_occupation(uuid) to authenticated;

notify pgrst, 'reload schema';
