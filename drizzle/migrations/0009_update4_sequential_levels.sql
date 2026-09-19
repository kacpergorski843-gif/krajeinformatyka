-- UPDATE 4.0: sequential building levels.
-- Existing rows/data are preserved. Only the purchase/build rule is tightened.

create or replace function public.build_in_slot(p_region_id uuid, p_slot_index smallint, p_item_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_country uuid;
  v_item public.shop_items;
  v_used int;
  v_mine text;
  v_mine_count int;
  v_fort int;
  v_factory_level int;
  v_required_code text;
  v_required_name text;
begin
  select country_id into v_country from public.regions where id = p_region_id;
  if v_country is null then raise exception 'Nie znaleziono regionu'; end if;
  perform public.assert_can_manage(v_country);

  select * into v_item from public.shop_items where code = p_item_code and active;
  if v_item.code is null or v_item.building is null then
    raise exception 'Ten produkt nie jest budynkiem regionalnym';
  end if;
  if p_slot_index < 1 or p_slot_index > 9 then raise exception 'Nieprawidłowy slot'; end if;

  perform 1 from public.regions where id = p_region_id for update;

  if exists (select 1 from public.region_slots where region_id = p_region_id and slot_index = p_slot_index) then
    raise exception 'Ten slot jest już zajęty';
  end if;

  select count(*) into v_used from public.region_slots where region_id = p_region_id;
  if v_used >= 9 then raise exception 'Region nie ma wolnych slotów'; end if;

  -- Factories must be purchased in strict order: I -> II -> III -> IV -> V -> VI.
  if v_item.building::text like 'factory_%' then
    v_factory_level := substring(v_item.building::text from 'factory_([0-9]+)')::int;
    if v_factory_level > 1 then
      v_required_code := 'factory_' || (v_factory_level - 1);
      v_required_name := 'Fabryka poziom ' || (v_factory_level - 1);
      if not exists (
        select 1
        from public.region_slots
        where region_id = p_region_id
          and building::text = v_required_code
      ) then
        raise exception 'Poziom zablokowany: wymagany %', v_required_name;
      end if;
    end if;
  end if;

  -- Fortifications also remain sequential: I -> II -> III.
  if v_item.building::text in ('fort_2','fort_3') then
    v_required_code := case v_item.building::text when 'fort_2' then 'fort_1' else 'fort_2' end;
    v_required_name := case v_item.building::text when 'fort_2' then 'Fort I' else 'Fort II' end;
    if not exists (
      select 1 from public.region_slots
      where region_id = p_region_id and building::text = v_required_code
    ) then
      raise exception 'Poziom zablokowany: wymagany %', v_required_name;
    end if;
  end if;

  if v_item.building::text like 'mine_%' then
    select s.building::text into v_mine from public.region_slots s
      where s.region_id = p_region_id and s.building::text like 'mine_%' limit 1;
    if v_mine is not null and v_mine <> v_item.building::text then
      raise exception 'W regionie mogą stać wytwórnie tylko jednego surowca';
    end if;
    select count(*) into v_mine_count from public.region_slots
      where region_id = p_region_id and building = v_item.building;
    if v_mine_count >= 3 then raise exception 'Maksymalnie 3 wytwórnie tego surowca w regionie'; end if;
  end if;

  if v_item.building::text in ('fort_1','fort_2','fort_3') then
    select count(*) into v_fort from public.region_slots
      where region_id = p_region_id and building in ('fort_1','fort_2','fort_3');
    if v_fort >= 1 then raise exception 'W regionie może stać tylko jedna fortyfikacja'; end if;
  end if;

  perform public.charge_country(v_country, v_item, 1);
  insert into public.region_slots (region_id, slot_index, building)
  values (p_region_id, p_slot_index, v_item.building);

  insert into public.transactions (country_id, kind, label, amount_kr, actor_id, details)
  values (v_country, 'BUILD', 'Budowa: ' || v_item.name, -v_item.cost_kr, auth.uid(),
          jsonb_build_object('region_id', p_region_id, 'slot', p_slot_index, 'item', v_item.code));
  return jsonb_build_object('ok', true);
end;
$function$;

grant execute on function public.build_in_slot(uuid, smallint, text) to authenticated;
