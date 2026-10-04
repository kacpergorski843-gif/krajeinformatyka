-- 0057: unlimited soldier/tank purchases.
-- Unit count is unlimited; only the derived war-vote contribution is capped
-- elsewhere by least(soldier_packs,6) + least(tank_packs,4).

create or replace function public.purchase_unit(
  p_country_id uuid,
  p_item_code text,
  p_qty integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_item public.shop_items;
begin
  if p_qty is null or p_qty < 1 or p_qty > 100000 then
    raise exception 'Nieprawidłowa ilość';
  end if;

  perform public.assert_can_manage(p_country_id);

  if p_item_code = 'aa' then
    raise exception 'OPL kupuje się dla konkretnego regionu';
  end if;

  select * into v_item
  from public.shop_items
  where code = p_item_code and active;

  if v_item.code is null then
    raise exception 'Nie znaleziono produktu';
  end if;

  if v_item.building is not null then
    raise exception 'Ten obiekt buduje się w regionie';
  end if;

  if p_item_code not in ('soldiers','tanks') then
    -- Keep all other purchase behavior delegated to the canonical charge/update path.
    perform public.charge_country(p_country_id, v_item, p_qty);

    update public.countries set
      missile_1 = missile_1 + case when p_item_code = 'missile_1' then p_qty else 0 end,
      missile_2 = missile_2 + case when p_item_code = 'missile_2' then p_qty else 0 end,
      missile_3 = missile_3 + case when p_item_code = 'missile_3' then p_qty else 0 end
    where id = p_country_id;
  else
    perform public.charge_country(p_country_id, v_item, p_qty);

    update public.countries set
      soldier_packs = soldier_packs + case when p_item_code = 'soldiers' then p_qty else 0 end,
      tank_packs = tank_packs + case when p_item_code = 'tanks' then p_qty else 0 end
    where id = p_country_id;
  end if;

  insert into public.transactions (country_id, kind, label, amount_kr, actor_id, details)
  values (
    p_country_id,
    'PURCHASE',
    'Zakup: ' || v_item.name || ' x' || p_qty,
    -(v_item.cost_kr * p_qty),
    auth.uid(),
    jsonb_build_object('item', v_item.code, 'qty', p_qty)
  );

  return jsonb_build_object('ok', true);
end;
$function$;

revoke execute on function public.purchase_unit(uuid,text,integer) from public;
grant execute on function public.purchase_unit(uuid,text,integer) to authenticated, service_role;

notify pgrst, 'reload schema';
