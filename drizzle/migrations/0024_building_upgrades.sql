-- Fix upgrades: upgrading a building replaces the existing slot instead of requiring a new slot.

create or replace function public.upgrade_building_in_slot(
  p_region_id uuid,
  p_slot_index smallint,
  p_item_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_country uuid;
  v_current public.region_slots;
  v_item public.shop_items;
  v_required text;
  v_old public.shop_items;
  v_delta_kr numeric;
  v_delta_coal numeric;
  v_delta_oil numeric;
  v_delta_copper numeric;
  v_delta_iron numeric;
  v_delta_uranium numeric;
begin
  select country_id into v_country
  from public.regions
  where id = p_region_id;

  if v_country is null then raise exception 'Nie znaleziono regionu'; end if;
  perform public.assert_can_manage(v_country);

  if p_slot_index < 1 or p_slot_index > 9 then
    raise exception 'Nieprawidłowy slot';
  end if;

  select * into v_item
  from public.shop_items
  where code = p_item_code and active;

  if v_item.code is null or v_item.building is null then
    raise exception 'Ten produkt nie jest budynkiem regionalnym';
  end if;

  if v_item.building::text like 'factory_%' then
    v_required := 'factory_' || (
      substring(v_item.building::text from 'factory_([0-9]+)')::int - 1
    );
  elsif v_item.building::text = 'fort_2' then
    v_required := 'fort_1';
  elsif v_item.building::text = 'fort_3' then
    v_required := 'fort_2';
  else
    raise exception 'Ten budynek nie obsługuje ulepszania';
  end if;

  select * into v_current
  from public.region_slots
  where region_id = p_region_id and slot_index = p_slot_index
  for update;

  if v_current.id is null then
    raise exception 'Nie znaleziono budynku do ulepszenia';
  end if;

  if v_current.building::text <> v_required then
    raise exception 'Do ulepszenia wymagany jest %', v_required;
  end if;

  select * into v_old
  from public.shop_items
  where building = v_current.building and active
  limit 1;

  if v_old.code is null then
    raise exception 'Nie znaleziono poprzedniego poziomu budynku';
  end if;

  v_delta_kr := v_item.cost_kr - v_old.cost_kr;
  v_delta_coal := v_item.cost_coal - v_old.cost_coal;
  v_delta_oil := v_item.cost_oil - v_old.cost_oil;
  v_delta_copper := v_item.cost_copper - v_old.cost_copper;
  v_delta_iron := v_item.cost_iron - v_old.cost_iron;
  v_delta_uranium := v_item.cost_uranium - v_old.cost_uranium;

  if exists (
    select 1 from public.countries c
    where c.id = v_country
      and (
        c.balance < greatest(v_delta_kr, 0)
        or c.coal < greatest(v_delta_coal, 0)
        or c.oil < greatest(v_delta_oil, 0)
        or c.copper < greatest(v_delta_copper, 0)
        or c.iron < greatest(v_delta_iron, 0)
        or c.uranium < greatest(v_delta_uranium, 0)
      )
  ) then
    raise exception 'Za mało środków na ulepszenie';
  end if;

  update public.countries
  set
    balance = balance - v_delta_kr,
    coal = coal - v_delta_coal,
    oil = oil - v_delta_oil,
    copper = copper - v_delta_copper,
    iron = iron - v_delta_iron,
    uranium = uranium - v_delta_uranium
  where id = v_country;

  update public.region_slots
  set building = v_item.building
  where id = v_current.id;

  insert into public.transactions (
    country_id, kind, label, amount_kr, actor_id, details
  )
  values (
    v_country,
    'BUILD_UPGRADE',
    'Ulepszenie: ' || v_old.name || ' → ' || v_item.name,
    -v_delta_kr,
    auth.uid(),
    jsonb_build_object(
      'region_id', p_region_id,
      'slot', p_slot_index,
      'from', v_old.code,
      'to', v_item.code
    )
  );

  return jsonb_build_object(
    'ok', true,
    'upgraded', true,
    'from', v_old.code,
    'to', v_item.code,
    'slot', p_slot_index
  );
end;
$function$;

grant execute on function public.upgrade_building_in_slot(uuid, smallint, text) to authenticated;
