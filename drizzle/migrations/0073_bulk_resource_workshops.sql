-- 0073: atomic bulk placement of resource workshops in selected region slots.
create or replace function public.build_mines_batch(
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
  v_current_building text;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_count int;
begin
  if p_targets is null or jsonb_typeof(p_targets) is distinct from 'array' then
    raise exception 'Nieprawidłowa lista miejsc budowy';
  end if;

  v_count := jsonb_array_length(p_targets);
  if v_count < 1 or v_count > 500 then
    raise exception 'Wybierz od 1 do 500 miejsc budowy';
  end if;

  select * into v_item
  from public.shop_items
  where code = p_item_code and active;

  if v_item.code is null
     or v_item.building is null
     or v_item.building::text not like 'mine_%' then
    raise exception 'Nieprawidłowa wytwórnia surowców';
  end if;

  if (select count(*) from (
    select value->>'region_id' as region_id, value->>'slot_index' as slot_index
    from jsonb_array_elements(p_targets)
    group by value->>'region_id', value->>'slot_index'
  ) duplicates) <> v_count then
    raise exception 'To samo miejsce zostało wybrane więcej niż raz';
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

    if v_current_building is not null then
      raise exception 'Wybrany slot jest już zajęty';
    end if;

    -- build_in_slot independently enforces ownership, available resources,
    -- one resource type per region and the three-workshop regional limit.
    v_result := public.build_in_slot(v_region_id, v_slot_index, p_item_code);
    v_results := v_results || jsonb_build_array(v_result);
  end loop;

  return jsonb_build_object('ok', true, 'count', v_count, 'results', v_results);
end;
$function$;

grant execute on function public.build_mines_batch(text, jsonb) to authenticated, service_role;
notify pgrst, 'reload schema';
