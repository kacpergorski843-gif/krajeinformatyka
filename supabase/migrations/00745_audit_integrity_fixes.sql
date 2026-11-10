-- 00745: close economy/transfer and market concurrency gaps found in the
-- function-by-function audit. All money/resource mutations remain atomic.

-- A building is refundable only to the player account that paid for it.
-- Admin grants (built_by = admin) and starter/system grants (built_by IS NULL)
-- must not be converted into player refunds.
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
  v_has_produced_income boolean := false;
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

  v_paid_build := v_built_by is not null and v_built_by = auth.uid();

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
    select exists (
      select 1
      from public.transactions t
      where t.country_id = v_country
        and t.kind = 'ECONOMY'
        and t.created_at >= v_built_at
    )
    into v_has_produced_income;

    if not v_has_produced_income then
      if now() - v_built_at <= interval '24 hours' then
        v_refund_percent := 1;
      else
        v_refund_percent := 0.75;
      end if;
    end if;

    v_refund_kr := v_item.cost_kr * v_refund_percent;
    v_refund_coal := v_item.cost_coal * v_refund_percent;
    v_refund_oil := v_item.cost_oil * v_refund_percent;
    v_refund_copper := v_item.cost_copper * v_refund_percent;
    v_refund_iron := v_item.cost_iron * v_refund_percent;
    v_refund_uranium := v_item.cost_uranium * v_refund_percent;
  end if;

  delete from public.region_slots where id = p_slot_id;

  update public.countries
  set balance = balance + v_refund_kr,
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
      'built_by', v_built_by,
      'paid_build', v_paid_build,
      'has_produced_income', v_has_produced_income,
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
    'has_produced_income', v_has_produced_income,
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

revoke all on function public.demolish_slot(uuid) from public;
grant execute on function public.demolish_slot(uuid) to authenticated, service_role;

-- The browser already enforces whole units and 1-billion-KR increments.
-- Enforce the same rules at the database boundary so direct RPC calls cannot
-- bypass them or create fractional resources in NUMERIC(30,0) columns.
create or replace function public.transfer_resource(
  p_from_country_id uuid,
  p_to_country_id uuid,
  p_resource text,
  p_amount numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_from public.countries;
  v_to public.countries;
  v_from_name text;
  v_to_name text;
  v_lock_first uuid;
  v_lock_second uuid;
  v_from_balance numeric;
begin
  if auth.uid() is null then
    raise exception 'Brak autoryzacji';
  end if;

  if p_amount is null or p_amount <= 0 or p_amount <> trunc(p_amount) then
    raise exception 'Ilość musi być dodatnią liczbą całkowitą';
  end if;

  if p_from_country_id is null or p_to_country_id is null then
    raise exception 'Państwo nadawcy i odbiorcy są wymagane';
  end if;

  if p_from_country_id = p_to_country_id then
    raise exception 'Nie możesz wysłać zasobu do własnego państwa';
  end if;

  if p_resource not in ('balance','coal','oil','copper','iron','uranium') then
    raise exception 'Ten zasób nie może być obecnie przesyłany';
  end if;

  if p_resource = 'balance'
     and (p_amount < 1000000000 or mod(p_amount, 1000000000) <> 0) then
    raise exception 'Transfer pieniędzy musi wynosić co najmniej 1 mld KR i być wielokrotnością 1 mld KR';
  end if;

  perform public.assert_can_manage(p_from_country_id);

  v_lock_first := least(p_from_country_id, p_to_country_id);
  v_lock_second := greatest(p_from_country_id, p_to_country_id);

  perform 1 from public.countries where id = v_lock_first for update;
  perform 1 from public.countries where id = v_lock_second for update;

  select * into v_from from public.countries where id = p_from_country_id;
  select * into v_to from public.countries where id = p_to_country_id;

  if v_from.id is null or v_to.id is null then
    raise exception 'Nie znaleziono państwa';
  end if;

  v_from_balance := case p_resource
    when 'balance' then v_from.balance
    when 'coal' then v_from.coal
    when 'oil' then v_from.oil
    when 'copper' then v_from.copper
    when 'iron' then v_from.iron
    when 'uranium' then v_from.uranium
    else 0
  end;

  if v_from_balance < p_amount then
    raise exception 'Brak wystarczającej ilości zasobu';
  end if;

  execute format(
    'update public.countries set %I = %I - $1 where id = $2',
    p_resource, p_resource
  ) using p_amount, p_from_country_id;

  execute format(
    'update public.countries set %I = %I + $1 where id = $2',
    p_resource, p_resource
  ) using p_amount, p_to_country_id;

  select name into v_from_name from public.countries where id = p_from_country_id;
  select name into v_to_name from public.countries where id = p_to_country_id;

  insert into public.transactions (
    country_id, kind, label, amount_kr, actor_id, details
  )
  values (
    p_from_country_id,
    'TRANSFER',
    'Transfer: ' || p_resource || ' → ' || v_to_name,
    case when p_resource = 'balance' then -p_amount else 0 end,
    auth.uid(),
    jsonb_build_object(
      'direction','out',
      'resource',p_resource,
      'amount',p_amount,
      'to_country_id',p_to_country_id
    )
  );

  insert into public.transactions (
    country_id, kind, label, amount_kr, actor_id, details
  )
  values (
    p_to_country_id,
    'TRANSFER',
    'Transfer: ' || p_resource || ' ← ' || v_from_name,
    case when p_resource = 'balance' then p_amount else 0 end,
    auth.uid(),
    jsonb_build_object(
      'direction','in',
      'resource',p_resource,
      'amount',p_amount,
      'from_country_id',p_from_country_id
    )
  );

  return jsonb_build_object(
    'ok',true,
    'resource',p_resource,
    'amount',p_amount
  );
end;
$function$;

revoke all on function public.transfer_resource(uuid, uuid, text, numeric) from public;
grant execute on function public.transfer_resource(uuid, uuid, text, numeric)
  to authenticated, service_role;

-- Use one lock order for every market operation: offer -> negotiation ->
-- countries. Previously this function locked negotiation -> offer, while
-- market_buy locked offer and then updated pending negotiations. Concurrent
-- acceptance and full purchase could therefore deadlock.
create or replace function public.market_respond_negotiation(
  p_negotiation_id uuid,
  p_action text,
  p_quantity numeric default null,
  p_unit_price numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  n public.market_negotiations;
  o public.market_offers;
  v_actor uuid := public.my_country_id();
  v_total numeric;
  v_offer_id uuid;
begin
  if auth.uid() is null or v_actor is null then
    raise exception 'Brak przypisanego państwa';
  end if;

  select offer_id into v_offer_id
  from public.market_negotiations
  where id = p_negotiation_id;

  if v_offer_id is null then
    raise exception 'Nie znaleziono negocjacji';
  end if;

  select * into o
  from public.market_offers
  where id = v_offer_id
  for update;

  if not found then
    raise exception 'Oferta jest niedostępna';
  end if;

  select * into n
  from public.market_negotiations
  where id = p_negotiation_id
  for update;

  if not found or n.offer_id <> o.id or n.status <> 'PENDING' or n.expires_at <= now() then
    raise exception 'Negocjacja nie jest aktywna';
  end if;

  if o.status <> 'ACTIVE' or o.expires_at <= now() then
    raise exception 'Oferta jest niedostępna';
  end if;

  if p_action = 'REJECT' then
    if v_actor not in (n.buyer_country_id, o.seller_country_id) then
      raise exception 'Brak uprawnień';
    end if;
    update public.market_negotiations
    set status = 'REJECTED', updated_at = now()
    where id = n.id;
    return jsonb_build_object('ok', true);

  elsif p_action = 'COUNTER' then
    if (v_actor = o.seller_country_id and n.last_offer_by <> 'BUYER')
       or (v_actor = n.buyer_country_id and n.last_offer_by <> 'SELLER')
       or v_actor not in (o.seller_country_id, n.buyer_country_id) then
      raise exception 'Teraz ruch drugiej strony';
    end if;

    if p_quantity is null or p_quantity < 1 or scale(p_quantity) > 0
       or p_quantity > o.quantity_remaining
       or p_unit_price is null or p_unit_price < 1 or scale(p_unit_price) > 0 then
      raise exception 'Nieprawidłowa kontroferta';
    end if;

    update public.market_negotiations
    set quantity = p_quantity,
        unit_price = p_unit_price,
        last_offer_by = case when v_actor = o.seller_country_id then 'SELLER' else 'BUYER' end,
        updated_at = now()
    where id = n.id;
    return jsonb_build_object('ok', true);

  elsif p_action = 'ACCEPT' then
    if v_actor <> o.seller_country_id or n.last_offer_by <> 'BUYER' then
      raise exception 'Nie możesz teraz zaakceptować tej propozycji';
    end if;

  elsif p_action = 'ACCEPT_COUNTER' then
    if v_actor <> n.buyer_country_id or n.last_offer_by <> 'SELLER' then
      raise exception 'Nie możesz teraz zaakceptować tej kontroferty';
    end if;

  else
    raise exception 'Nieznana operacja';
  end if;

  if n.quantity > o.quantity_remaining then
    raise exception 'Oferta nie ma już takiej ilości';
  end if;

  v_total := n.quantity * n.unit_price;

  perform 1 from public.countries
  where id = least(n.buyer_country_id, o.seller_country_id)
  for update;

  perform 1 from public.countries
  where id = greatest(n.buyer_country_id, o.seller_country_id)
  for update;

  if (select balance from public.countries where id = n.buyer_country_id) < v_total then
    raise exception 'Kupujący nie ma wystarczających środków';
  end if;

  update public.countries set balance = balance - v_total
  where id = n.buyer_country_id;

  execute format(
    'update public.countries set %I = %I + $1 where id = $2',
    o.resource, o.resource
  ) using n.quantity, n.buyer_country_id;

  update public.countries set balance = balance + v_total
  where id = o.seller_country_id;

  update public.market_offers
  set quantity_remaining = quantity_remaining - n.quantity,
      status = case when quantity_remaining - n.quantity = 0 then 'SOLD' else 'ACTIVE' end
  where id = o.id;

  if o.quantity_remaining - n.quantity = 0 then
    update public.market_negotiations
    set status = 'CANCELLED', updated_at = now()
    where offer_id = o.id and status = 'PENDING' and id <> n.id;
  end if;

  insert into public.market_sales(
    offer_id, seller_country_id, buyer_country_id, resource,
    quantity, unit_price, total_price
  )
  values (
    o.id, o.seller_country_id, n.buyer_country_id, o.resource,
    n.quantity, n.unit_price, v_total
  );

  insert into public.transactions(country_id, kind, label, amount_kr, actor_id, details)
  values
    (
      n.buyer_country_id, 'MARKET_BUY', 'Zakup po negocjacji: ' || o.resource,
      -v_total, auth.uid(),
      jsonb_build_object(
        'offer_id', o.id, 'quantity', n.quantity,
        'unit_price', n.unit_price, 'seller_country_id', o.seller_country_id
      )
    ),
    (
      o.seller_country_id, 'MARKET_SELL', 'Sprzedaż po negocjacji: ' || o.resource,
      v_total, auth.uid(),
      jsonb_build_object(
        'offer_id', o.id, 'quantity', n.quantity,
        'unit_price', n.unit_price, 'buyer_country_id', n.buyer_country_id
      )
    );

  update public.market_negotiations
  set status = 'ACCEPTED', updated_at = now()
  where id = n.id;

  return jsonb_build_object('ok', true, 'quantity', n.quantity, 'total', v_total);
end;
$function$;

revoke all on function public.market_respond_negotiation(uuid, text, numeric, numeric) from public;
grant execute on function public.market_respond_negotiation(uuid, text, numeric, numeric)
  to authenticated, service_role;

notify pgrst, 'reload schema';
