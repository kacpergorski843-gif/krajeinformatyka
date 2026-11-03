-- 0072: atomic bulk placement of factories in explicitly selected region slots.
create or replace function public.build_factories_batch(
  p_item_code text,
  p_targets jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_item public.shop_items;
  v_target jsonb;
  v_region_id uuid;
  v_slot_index smallint;
  v_required_code text;
  v_current_building text;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_count int;
begin
  if p_targets is null or jsonb_typeof(p_targets) is distinct from 'array' then
    raise exception 'Nieprawidłowa lista miejsc budowy';
  end if;

  v_count := jsonb_array_length(p_targets);
  if v_count < 1 or v_count > 81 then
    raise exception 'Wybierz od 1 do 81 miejsc budowy';
  end if;

  select * into v_item
  from public.shop_items
  where code = p_item_code and active;

  if v_item.code is null
     or v_item.building is null
     or v_item.building::text not like 'factory_%' then
    raise exception 'Nieprawidłowy poziom fabryki';
  end if;

  if (select count(*) from (
    select value->>'region_id' as region_id, value->>'slot_index' as slot_index
    from jsonb_array_elements(p_targets)
    group by value->>'region_id', value->>'slot_index'
  ) duplicates) <> v_count then
    raise exception 'To samo miejsce zostało wybrane więcej niż raz';
  end if;

  v_required_code := null;
  if substring(v_item.building::text from 'factory_([0-9]+)')::int > 1 then
    v_required_code := 'factory_' ||
      (substring(v_item.building::text from 'factory_([0-9]+)')::int - 1);
  end if;

  for v_target in select value from jsonb_array_elements(p_targets)
  loop
    begin
      v_region_id := (v_target->>'region_id')::uuid;
      v_slot_index := (v_target->>'slot_index')::smallint;
    exception when others then
      raise exception 'Nieprawidłowe miejsce budowy';
    end;

    if v_region_id is null or v_slot_index is null then
      raise exception 'Nieprawidłowe miejsce budowy';
    end if;

    if v_slot_index < 1 or v_slot_index > 9 then
      raise exception 'Nieprawidłowy slot';
    end if;

    select building::text into v_current_building
    from public.region_slots
    where region_id = v_region_id and slot_index = v_slot_index
    for update;

    if v_required_code is not null then
      if v_current_building is distinct from v_required_code then
        raise exception 'W wybranym miejscu wymagany jest %', v_required_code;
      end if;
      v_result := public.upgrade_building_in_slot(v_region_id, v_slot_index, p_item_code);
    else
      if v_current_building is not null then
        raise exception 'Wybrany slot jest już zajęty';
      end if;
      v_result := public.build_in_slot(v_region_id, v_slot_index, p_item_code);
    end if;

    v_results := v_results || jsonb_build_array(v_result);
  end loop;

  return jsonb_build_object('ok', true, 'count', v_count, 'results', v_results);
end;
$function$;

grant execute on function public.build_factories_batch(text, jsonb) to authenticated, service_role;
notify pgrst, 'reload schema';
