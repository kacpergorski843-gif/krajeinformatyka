-- 0034 REGION CONTROL TAKEOVER HARDENING
-- A region is a permanent game object. Winning a war/admin takeover changes only
-- the current controller (regions.country_id); the region, slots and buildings stay.
-- Economic/statistical views already derive region income/production from country_id.

-- 1) Repair the legal/original owner for regions that already have occupation history.
-- The first occupation's previous_country_id is the owner that existed before the
-- first takeover. This fixes the earlier migration which could use the latest event.
update public.regions r
set owner_country_id = first_event.previous_country_id
from (
  select distinct on (region_id)
    region_id,
    previous_country_id
  from public.region_occupations
  where previous_country_id is distinct from current_country_id
  order by region_id, occupied_at asc
) first_event
where r.id = first_event.region_id
  and first_event.previous_country_id is not null;

-- 2) Admin takeover: change the controller without creating/deleting a region.
-- The original owner is retained for history and UI. The original owner may also
-- retake the region later; that is a valid takeover and must not be blocked.
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
  v_controller uuid;
  v_owner uuid;
  v_region_name text;
  v_now timestamptz := now();
begin
  select role::text into v_role
  from public.user_roles
  where user_id = auth.uid()
    and role in ('ADMIN','MAIN_ADMIN')
  order by role desc
  limit 1;

  if v_role is null then
    raise exception 'Brak uprawnień administratora';
  end if;

  select country_id, coalesce(owner_country_id, country_id), name
    into v_controller, v_owner, v_region_name
  from public.regions
  where id = p_region_id
  for update;

  if v_controller is null then
    raise exception 'Nie znaleziono regionu';
  end if;

  if not exists (select 1 from public.countries where id = p_new_country_id) then
    raise exception 'Nie znaleziono kraju przejmującego';
  end if;

  if v_controller = p_new_country_id then
    raise exception 'Region już jest kontrolowany przez to państwo';
  end if;

  -- Keep the original/legal owner stable. Only the active controller changes.
  update public.regions
  set owner_country_id = v_owner,
      country_id = p_new_country_id
  where id = p_region_id;

  insert into public.region_occupations(
    region_id,
    previous_country_id,
    current_country_id,
    occupied_at
  ) values (
    p_region_id,
    v_controller,
    p_new_country_id,
    v_now
  );

  insert into public.admin_actions(action, country_id, details, actor_id)
  values (
    'OCCUPY_REGION',
    p_new_country_id,
    jsonb_build_object(
      'region_id', p_region_id,
      'region_name', v_region_name,
      'owner_country_id', v_owner,
      'previous_controller_country_id', v_controller,
      'new_controller_country_id', p_new_country_id,
      'occupied_at', v_now,
      'kept_region_id', true,
      'kept_infrastructure', true,
      'income_follows_controller', true
    ),
    auth.uid()
  );

  return jsonb_build_object(
    'ok', true,
    'region_id', p_region_id,
    'region_name', v_region_name,
    'owner_country_id', v_owner,
    'previous_controller_country_id', v_controller,
    'controller_country_id', p_new_country_id,
    'is_occupied', v_owner is distinct from p_new_country_id
  );
end;
$function$;

grant execute on function public.admin_occupy_region(uuid,uuid) to authenticated;

-- 3) Explicitly document/enforce that current controller is the economic owner
-- of region-derived income/production. country_stats already groups region_slots
-- and region bonuses by regions.country_id, so no resource transfer/copy is needed.
comment on column public.regions.country_id is
  'Aktualny kontroler regionu. Dochody, produkcja, budynki i bonusy regionowe są przypisane do tego państwa.';

comment on column public.regions.owner_country_id is
  'Pierwotny/prawny właściciel regionu używany do historii okupacji; nie steruje bieżącą ekonomią regionu.';

notify pgrst, 'reload schema';
