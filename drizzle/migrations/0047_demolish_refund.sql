-- 0047: refund building costs on demolition.
-- Up to 24h: 100% refund. After 24h: 75% refund.
-- Refunds include KR and all resource costs stored on the shop item.

create or replace function public.demolish_slot(p_slot_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_country uuid;
  v_building public.building_type;
  v_created_at timestamptz;
  v_item public.shop_items;
  v_refund_percent numeric := 0.75;
  v_refund_kr numeric;
  v_refund_coal numeric;
  v_refund_oil numeric;
  v_refund_copper numeric;
  v_refund_iron numeric;
  v_refund_uranium numeric;
begin
  select r.country_id, s.building, s.created_at
    into v_country, v_building, v_created_at
  from public.region_slots s
  join public.regions r on r.id = s.region_id
  where s.id = p_slot_id
  for update of s, r;

  if v_country is null then
    raise exception 'Nie znaleziono obiektu';
  end if;

  perform public.assert_can_manage(v_country);

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

  if now() - v_created_at <= interval '24 hours' then
    v_refund_percent := 1;
  end if;

  v_refund_kr := v_item.cost_kr * v_refund_percent;
  v_refund_coal := v_item.cost_coal * v_refund_percent;
  v_refund_oil := v_item.cost_oil * v_refund_percent;
  v_refund_copper := v_item.cost_copper * v_refund_percent;
  v_refund_iron := v_item.cost_iron * v_refund_percent;
  v_refund_uranium := v_item.cost_uranium * v_refund_percent;

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
      'built_at', v_created_at,
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
