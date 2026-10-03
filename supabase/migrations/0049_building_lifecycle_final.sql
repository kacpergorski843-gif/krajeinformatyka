-- 0049: finalize building lifecycle rules.
-- Paid buildings can be refunded on demolition; free/admin/starter grants cannot.
-- An upgrade starts a fresh 24h demolition-refund window for the new level.

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

  if v_country is null then
    raise exception 'Nie znaleziono regionu';
  end if;

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
  where region_id = p_region_id
    and slot_index = p_slot_index
  for update;

  if v_current.id is null then
    raise exception 'Nie znaleziono budynku do ulepszenia';
  end if;

  if v_current.building::text <> v_required then
    raise exception 'Do ulepszenia wymagany jest %', v_required;
  end if;

  select * into v_old
  from public.shop_items
  where building = v_current.building
    and active
  order by sort_order
  limit 1;

  if v_old.code is null then
    raise exception 'Nie znaleziono poprzedniego poziomu budynku';
  end if;

  perform public.charge_country(v_country, v_item, 1);

  update public.region_slots
  set building = v_item.building,
      built_at = now(),
      built_by = auth.uid(),
      created_at = now()
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
      'to', v_item.code,
      'upgraded_at', now()
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

create or replace function public.demolish_slot(p_slot_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_country uuid;
  v_building public.building_type;
  v_built_at timestamptz;
  v_built_by uuid;
  v_item public.shop_items;
  v_refund_percent numeric := 0;
  v_paid_build boolean := false;
  v_refund_kr numeric := 0;
  v_refund_coal numeric := 0;
  v_refund_oil numeric := 0;
  v_refund_copper numeric := 0;
  v_refund_iron numeric := 0;
  v_refund_uranium numeric := 0;
begin
  select r.country_id, s.building, s.built_at, s.built_by
    into v_country, v_building, v_built_at, v_built_by
  from public.region_slots s
  join public.regions r on r.id = s.region_id
  where s.id = p_slot_id
  for update of s, r;

  if v_country is null then
    raise exception 'Nie znaleziono obiektu';
  end if;

  perform public.assert_can_manage(v_country);

  v_paid_build := v_built_by is not null;

  select *
    into v_item
  from public.shop_items
  where building = v_building
    and active
  order by sort_order
  limit 1;

  if v_item.code is null then
    raise exception 'Nie znaleziono kosztu tego obiektu';
  end if;

  if v_paid_build then
    if now() - v_built_at <= interval '24 hours' then
      v_refund_percent := 1;
    else
      v_refund_percent := 0.75;
    end if;

    v_refund_kr := v_item.cost_kr * v_refund_percent;
    v_refund_coal := v_item.cost_coal * v_refund_percent;
    v_refund_oil := v_item.cost_oil * v_refund_percent;
    v_refund_copper := v_item.cost_copper * v_refund_percent;
    v_refund_iron := v_item.cost_iron * v_refund_percent;
    v_refund_uranium := v_item.cost_uranium * v_refund_percent;
  end if;

  delete from public.region_slots
  where id = p_slot_id;

  update public.countries
  set
    balance = balance + v_refund_kr,
    coal = coal + v_refund_coal,
    oil = oil + v_refund_oil,
    copper = copper + v_refund_copper,
    iron = iron + v_refund_iron,
    uranium = uranium + v_refund_uranium
  where id = v_country;

  insert into public.transactions (country_id, kind, label, amount_kr, actor_id, details)
  values (
    v_country,
    'DEMOLISH',
    'Rozbiórka: ' || v_item.name,
    v_refund_kr,
    auth.uid(),
    jsonb_build_object(
      'slot_id', p_slot_id,
      'building', v_building::text,
      'built_at', v_built_at,
      'paid_build', v_paid_build,
      'refund_percent', v_refund_percent,
      'refund_kr', v_refund_kr,
      'refund_coal', v_refund_coal,
      'refund_oil', v_refund_oil,
      'refund_copper', v_refund_copper,
      'refund_iron', v_refund_iron,
      'refund_uranium', v_refund_uranium
    )
  );

  return jsonb_build_object(
    'ok', true,
    'paid_build', v_paid_build,
    'refund_percent', v_refund_percent,
    'refund_kr', v_refund_kr,
    'refund_coal', v_refund_coal,
    'refund_oil', v_refund_oil,
    'refund_copper', v_refund_copper,
    'refund_iron', v_refund_iron,
    'refund_uranium', v_refund_uranium
  );
end;
$function$;

grant execute on function public.demolish_slot(uuid) to authenticated;

notify pgrst, 'reload schema';
