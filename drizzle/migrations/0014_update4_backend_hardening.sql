-- UPDATE 4.0 hardening: close backend edge cases without changing existing data.
-- This migration is additive/idempotent and keeps all existing mechanics/values intact.

-- Admin building grants must never overwrite an occupied slot.
-- Requirements such as factory/fort sequence are intentionally bypassed for admins.
create or replace function public.admin_grant_building(
  p_country_id uuid,
  p_region_id uuid,
  p_slot_index smallint,
  p_building text,
  p_quantity integer default 1
) returns jsonb
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_role text;
  v_item public.shop_items;
  v_i int;
  v_slot smallint;
  v_granted integer := 0;
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

  if p_country_id is null or p_region_id is null then
    raise exception 'Państwo i region są wymagane';
  end if;

  if p_quantity < 1 or p_quantity > 9 then
    raise exception 'Nieprawidłowa ilość';
  end if;

  if p_slot_index < 1 or p_slot_index + p_quantity - 1 > 9 then
    raise exception 'Budynki muszą mieścić się w slotach 1–9';
  end if;

  if not exists (
    select 1 from public.countries where id = p_country_id
  ) then
    raise exception 'Nie znaleziono państwa';
  end if;

  if not exists (
    select 1 from public.regions
    where id = p_region_id and country_id = p_country_id
  ) then
    raise exception 'Region nie należy do państwa';
  end if;

  select *
    into v_item
  from public.shop_items
  where building = p_building::building_type
    and active
  limit 1;

  if v_item.building is null then
    raise exception 'Nie znaleziono aktywnego budynku';
  end if;

  -- Lock the region so two admin operations cannot allocate the same slots.
  perform 1 from public.regions where id = p_region_id for update;

  for v_i in 0..p_quantity-1 loop
    v_slot := p_slot_index + v_i;

    if exists (
      select 1
      from public.region_slots
      where region_id = p_region_id and slot_index = v_slot
    ) then
      raise exception 'Slot % jest już zajęty', v_slot;
    end if;

    insert into public.region_slots(region_id, slot_index, building)
    values (p_region_id, v_slot, p_building::building_type);

    v_granted := v_granted + 1;
  end loop;

  insert into public.admin_actions(action, country_id, details, actor_id)
  values (
    'GRANT_BUILDING',
    p_country_id,
    jsonb_build_object(
      'region_id', p_region_id,
      'slot', p_slot_index,
      'building', p_building,
      'quantity', v_granted,
      'bypass_requirements', true
    ),
    auth.uid()
  );

  return jsonb_build_object(
    'ok', true,
    'quantity', v_granted,
    'bypass_requirements', true
  );
end;
$function$;

grant execute on function public.admin_grant_building(uuid,uuid,smallint,text,integer) to authenticated;

-- Keep occupation history authoritative: lock both region and destination country,
-- validate the target, then update + history + audit in one transaction.
create or replace function public.admin_occupy_region(
  p_region_id uuid,
  p_new_country_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_role text;
  v_old uuid;
  v_region_name text;
  v_occupied_at timestamptz := now();
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

  if p_region_id is null or p_new_country_id is null then
    raise exception 'Region i państwo przejmujące są wymagane';
  end if;

  perform 1 from public.countries where id = p_new_country_id for update;

  select country_id, name
    into v_old, v_region_name
  from public.regions
  where id = p_region_id
  for update;

  if v_old is null then
    raise exception 'Nie znaleziono regionu';
  end if;

  if not exists (
    select 1 from public.countries where id = p_new_country_id
  ) then
    raise exception 'Nie znaleziono kraju przejmującego';
  end if;

  if v_old = p_new_country_id then
    raise exception 'Region już należy do tego państwa';
  end if;

  update public.regions
  set country_id = p_new_country_id
  where id = p_region_id;

  insert into public.region_occupations(
    region_id,
    previous_country_id,
    current_country_id,
    occupied_at,
    actor_id
  )
  values (
    p_region_id,
    v_old,
    p_new_country_id,
    v_occupied_at,
    auth.uid()
  );

  insert into public.admin_actions(action, country_id, details, actor_id)
  values (
    'OCCUPY_REGION',
    p_new_country_id,
    jsonb_build_object(
      'region_id', p_region_id,
      'region_name', v_region_name,
      'previous_country_id', v_old,
      'new_country_id', p_new_country_id,
      'occupied_at', v_occupied_at
    ),
    auth.uid()
  );

  return jsonb_build_object(
    'ok', true,
    'region_id', p_region_id,
    'region_name', v_region_name,
    'previous_country_id', v_old,
    'new_country_id', p_new_country_id,
    'occupied_at', v_occupied_at
  );
end;
$function$;

grant execute on function public.admin_occupy_region(uuid,uuid) to authenticated;

-- Explicit active-bonus helper for future UI/API consumers.
-- Expiration is data-driven: once ends_at <= now(), it is no longer active.
create or replace function public.active_income_bonus()
returns jsonb
language sql
stable
security definer
set search_path=public
as $function$
  select coalesce(
    (
      select jsonb_build_object(
        'id', id,
        'percent', percent,
        'starts_at', starts_at,
        'ends_at', ends_at
      )
      from public.economy_bonuses
      where starts_at <= now()
        and ends_at > now()
      order by ends_at asc
      limit 1
    ),
    jsonb_build_object(
      'id', null,
      'percent', 0,
      'starts_at', null,
      'ends_at', null
    )
  );
$function$;

grant execute on function public.active_income_bonus() to authenticated;
