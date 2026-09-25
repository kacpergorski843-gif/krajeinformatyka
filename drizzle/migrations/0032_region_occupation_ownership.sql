-- UPDATE 4.3: keep legal ownership separate from occupation control.
-- regions.country_id remains the effective controller so existing production
-- and region-based bonuses continue to flow to the occupying country.

alter table public.regions
  add column if not exists owner_country_id uuid references public.countries(id) on delete cascade;

-- Regions that have never been occupied keep their current owner.
update public.regions
set owner_country_id = country_id
where owner_country_id is null;

-- For already recorded active occupations, restore the original owner.
update public.regions r
set owner_country_id = x.previous_country_id
from (
  select distinct on (region_id)
    region_id,
    previous_country_id,
    current_country_id
  from public.region_occupations
  order by region_id, occupied_at desc
) x
where r.id = x.region_id
  and r.country_id = x.current_country_id
  and x.previous_country_id <> x.current_country_id;

create index if not exists regions_owner_country_id_idx
  on public.regions(owner_country_id);

-- Public read model for the game UI.
-- owner_country_id = legal/original owner
-- country_id = current controller (occupier while occupied)
create or replace view public.region_control_state as
select
  r.id as region_id,
  r.name as region_name,
  r.owner_country_id,
  owner.name as owner_country_name,
  r.country_id as controller_country_id,
  controller.name as controller_country_name,
  (r.owner_country_id is distinct from r.country_id) as is_occupied
from public.regions r
join public.countries owner on owner.id = r.owner_country_id
join public.countries controller on controller.id = r.country_id;

grant select on public.region_control_state to authenticated;

-- Rebuild occupation so it never destroys the original owner.
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
  v_existing_occupier uuid;
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

  select country_id, coalesce(owner_country_id, country_id)
    into v_controller, v_owner
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

  -- Never allow the original owner to be lost during a chain of occupations.
  if v_owner = p_new_country_id then
    raise exception 'Właściciel regionu nie może okupować własnego regionu';
  end if;

  -- If this is a fresh occupation, remember the current legal owner.
  update public.regions
  set owner_country_id = v_owner,
      country_id = p_new_country_id
  where id = p_region_id;

  insert into public.region_occupations(
    region_id, previous_country_id, current_country_id, occupied_at
  ) values (
    p_region_id, v_controller, p_new_country_id, now()
  );

  insert into public.admin_actions(action, country_id, details, actor_id)
  values (
    'OCCUPY_REGION',
    p_new_country_id,
    jsonb_build_object(
      'region_id', p_region_id,
      'owner_country_id', v_owner,
      'previous_controller_country_id', v_controller,
      'occupier_country_id', p_new_country_id,
      'occupied_at', now()
    ),
    auth.uid()
  );

  return jsonb_build_object(
    'ok', true,
    'owner_country_id', v_owner,
    'previous_controller_country_id', v_controller,
    'occupier_country_id', p_new_country_id,
    'is_occupied', true
  );
end;
$function$;

grant execute on function public.admin_occupy_region(uuid,uuid) to authenticated;

-- Revert always returns control to the legal owner, not merely the previous occupier.
create or replace function public.admin_revert_region_occupation(p_region_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_role text;
  v_controller uuid;
  v_owner uuid;
  v_occupied_at timestamptz;
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

  select country_id, coalesce(owner_country_id, country_id)
    into v_controller, v_owner
  from public.regions
  where id = p_region_id
  for update;

  if v_controller is null then
    raise exception 'Nie znaleziono regionu';
  end if;

  if v_controller = v_owner then
    raise exception 'Ten region nie jest obecnie okupowany';
  end if;

  select occupied_at into v_occupied_at
  from public.region_occupations
  where region_id = p_region_id
    and current_country_id = v_controller
    and previous_country_id <> current_country_id
  order by occupied_at desc
  limit 1;

  if v_occupied_at is null then
    raise exception 'Nie znaleziono aktywnej okupacji';
  end if;

  update public.regions
  set country_id = v_owner,
      owner_country_id = v_owner
  where id = p_region_id
    and country_id = v_controller;

  insert into public.region_occupations(
    region_id, previous_country_id, current_country_id, occupied_at
  ) values (
    p_region_id, v_controller, v_owner, now()
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
    auth.uid()
  );

  return jsonb_build_object(
    'ok', true,
    'region_id', p_region_id,
    'restored_country_id', v_owner,
    'previous_occupier_country_id', v_controller
  );
end;
$function$;

grant execute on function public.admin_revert_region_occupation(uuid) to authenticated;

notify pgrst, 'reload schema';
