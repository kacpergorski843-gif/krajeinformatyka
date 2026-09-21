-- Ensure the building upgrade RPC is present in PostgREST schema cache.
drop function if exists public.upgrade_building_in_slot(uuid, smallint, text);

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

  -- Ulepszenie kosztuje pełną cenę nowego poziomu z katalogu sklepu.
  perform public.charge_country(v_country, v_item, 1);

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
    -v_item.cost_kr,
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


notify pgrst, 'reload schema';
