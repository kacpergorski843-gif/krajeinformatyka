-- 0074: correct starter region naming and make occupation history authoritative.

-- Repair legacy revert events written after event_type was introduced.
-- The old revert RPC omitted event_type, so its rows inherited OCCUPATION.
update public.region_occupations ro
set event_type = 'REVERT'
from public.admin_actions aa
where aa.action = 'REVERT_REGION_OCCUPATION'
  and aa.details->>'region_id' = ro.region_id::text
  and aa.details->>'previous_occupier_country_id' = ro.previous_country_id::text
  and coalesce(
    aa.details->>'restored_owner_country_id',
    aa.details->>'restored_country_id'
  ) = ro.current_country_id::text
  and ro.occupied_at >= coalesce((aa.details->>'reverted_at')::timestamptz, ro.occupied_at) - interval '5 seconds'
  and ro.occupied_at <= coalesce((aa.details->>'reverted_at')::timestamptz, ro.occupied_at) + interval '5 seconds'
  and ro.event_type = 'OCCUPATION';

-- Reverting an occupation is a distinct event, not another occupation.
create or replace function public.admin_revert_region_occupation(p_region_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_role text;
  v_controller uuid;
  v_owner uuid;
  v_occupied_at timestamptz;
  v_latest_event_type text;
  v_latest_country_id uuid;
begin
  select ur.role::text into v_role
  from public.user_roles ur
  where ur.user_id = (select auth.uid())
    and ur.role in ('ADMIN','MAIN_ADMIN')
  order by ur.role desc
  limit 1;

  if v_role is null then
    raise exception 'Brak uprawnień administratora';
  end if;

  if p_region_id is null then
    raise exception 'Nie wybrano regionu';
  end if;

  select r.country_id, coalesce(r.owner_country_id, r.country_id)
    into v_controller, v_owner
  from public.regions r
  where r.id = p_region_id
  for update;

  if v_controller is null then
    raise exception 'Nie znaleziono regionu';
  end if;

  if v_controller = v_owner then
    raise exception 'Ten region nie jest obecnie okupowany';
  end if;

  select ro.event_type, ro.current_country_id, ro.occupied_at
    into v_latest_event_type, v_latest_country_id, v_occupied_at
  from public.region_occupations ro
  where ro.region_id = p_region_id
  order by ro.occupied_at desc, ro.id desc
  limit 1;

  if v_latest_event_type is distinct from 'OCCUPATION'
     or v_latest_country_id is distinct from v_controller then
    raise exception 'Nie znaleziono aktywnej okupacji — odśwież panel i spróbuj ponownie';
  end if;

  update public.regions
  set country_id = v_owner,
      owner_country_id = v_owner
  where id = p_region_id
    and country_id = v_controller;

  insert into public.region_occupations(
    region_id, previous_country_id, current_country_id, event_type, occupied_at
  ) values (
    p_region_id, v_controller, v_owner, 'REVERT', now()
  );

  insert into public.admin_actions(action, country_id, details, actor_id)
  values (
    'REVERT_REGION_OCCUPATION',
    v_owner,
    jsonb_build_object(
      'region_id', p_region_id,
      'restored_owner_country_id', v_owner,
      'previous_occupier_country_id', v_controller,
      'original_occupied_at', v_occupied_at,
      'reverted_at', now()
    ),
    (select auth.uid())
  );

  return jsonb_build_object(
    'ok', true,
    'region_id', p_region_id,
    'restored_country_id', v_owner,
    'previous_occupier_country_id', v_controller
  );
end;
$function$;

revoke execute on function public.admin_revert_region_occupation(uuid) from public, anon;
grant execute on function public.admin_revert_region_occupation(uuid) to authenticated;

-- New countries now receive the first region under the same name as later
-- generated regions: "Region 1" (instead of the one-off name "Stolica").
create or replace function public.grant_starter_factories(p_country_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_factory_count integer;
  v_region_id uuid;
  v_slot smallint;
  v_new_region_no integer;
begin
  if p_country_id is null then
    raise exception 'Nie wybrano państwa';
  end if;

  select count(*)
    into v_factory_count
  from public.region_slots s
  join public.regions r on r.id = s.region_id
  where r.country_id = p_country_id
    and s.building = 'factory_1';

  while v_factory_count < 3 loop
    v_region_id := null;
    v_slot := null;

    select r.id, gs.slot_index::smallint
      into v_region_id, v_slot
    from public.regions r
    cross join lateral generate_series(1, 9) as gs(slot_index)
    where r.country_id = p_country_id
      and not exists (
        select 1
        from public.region_slots s
        where s.region_id = r.id
          and s.slot_index = gs.slot_index
      )
    order by r.created_at, r.id, gs.slot_index
    limit 1;

    if v_region_id is null then
      if not exists (
        select 1 from public.regions where country_id = p_country_id
      ) then
        insert into public.regions (country_id, name)
        values (p_country_id, 'Region 1')
        returning id into v_region_id;
      else
        select count(*) + 1
          into v_new_region_no
        from public.regions
        where country_id = p_country_id;

        insert into public.regions (country_id, name)
        values (p_country_id, 'Region ' || v_new_region_no)
        returning id into v_region_id;
      end if;

      v_slot := 1;
    end if;

    insert into public.region_slots (region_id, slot_index, building)
    values (v_region_id, v_slot, 'factory_1');

    v_factory_count := v_factory_count + 1;
  end loop;
end;
$$;

revoke all on function public.grant_starter_factories(uuid) from public;
grant execute on function public.grant_starter_factories(uuid) to service_role;

notify pgrst, 'reload schema';
