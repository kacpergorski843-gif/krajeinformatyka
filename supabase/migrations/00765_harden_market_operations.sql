-- 00765: harden market expiry, audit trail and negotiation lock ordering.

-- Only trusted server-side callers and admins may expire offers globally.
-- Authenticated players invoke the same routine through market RPCs, but the
-- internal worker is not directly executable by client roles.
create or replace function public.market_expire_offers_internal()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_count integer := 0;
begin
  for r in
    select *
    from public.market_offers
    where status = 'ACTIVE' and expires_at <= now()
    order by id
    for update skip locked
  loop
    update public.countries set
      coal = coal + case when r.resource = 'coal' then r.quantity_remaining else 0 end,
      oil = oil + case when r.resource = 'oil' then r.quantity_remaining else 0 end,
      copper = copper + case when r.resource = 'copper' then r.quantity_remaining else 0 end,
      iron = iron + case when r.resource = 'iron' then r.quantity_remaining else 0 end,
      uranium = uranium + case when r.resource = 'uranium' then r.quantity_remaining else 0 end,
      soldier_packs = soldier_packs + case when r.resource = 'soldier_packs' then r.quantity_remaining else 0 end,
      tank_packs = tank_packs + case when r.resource = 'tank_packs' then r.quantity_remaining else 0 end,
      missile_1 = missile_1 + case when r.resource = 'missile_1' then r.quantity_remaining else 0 end,
      missile_2 = missile_2 + case when r.resource = 'missile_2' then r.quantity_remaining else 0 end,
      missile_3 = missile_3 + case when r.resource = 'missile_3' then r.quantity_remaining else 0 end
    where id = r.seller_country_id;

    update public.market_offers
    set status = 'EXPIRED', quantity_remaining = 0, total_price_remaining = 0
    where id = r.id;

    update public.market_negotiations
    set status = 'EXPIRED', updated_at = now()
    where offer_id = r.id and status = 'PENDING';

    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.market_expire_offers_internal() from public, anon, authenticated;

create or replace function public.market_expire_offers()
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin(auth.uid()) then
    raise exception 'Brak uprawnień do globalnego wygaszania ofert';
  end if;
  if auth.uid() is null and coalesce(auth.role(), '') not in ('service_role', 'postgres') then
    raise exception 'Brak uprawnień do globalnego wygaszania ofert';
  end if;
  return public.market_expire_offers_internal();
end;
$$;

revoke all on function public.market_expire_offers() from public, anon;
grant execute on function public.market_expire_offers() to authenticated, service_role;

-- Internal expiry worker is used from SECURITY DEFINER market write RPCs.
create or replace function public.market_create_offer_total(p_resource text, p_quantity numeric, p_total_price numeric)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_country uuid := public.my_country_id();
  v_id uuid;
  v_available numeric;
  v_unit numeric;
begin
  if auth.uid() is null or v_country is null then raise exception 'Brak przypisanego państwa'; end if;
  perform public.assert_can_manage(v_country);
  if p_resource not in ('coal','oil','copper','iron','uranium','soldier_packs','tank_packs','missile_1','missile_2','missile_3') then
    raise exception 'Nieobsługiwany towar';
  end if;
  if p_quantity is null or p_quantity < 1 or scale(p_quantity) > 0
     or p_total_price is null or p_total_price < p_quantity or scale(p_total_price) > 0 then
    raise exception 'Ilość i łączna cena muszą być dodatnimi liczbami całkowitymi';
  end if;

  perform public.market_expire_offers_internal();
  perform 1 from public.countries where id = v_country for update;
  if (select count(*) from public.market_offers
      where seller_country_id = v_country and status = 'ACTIVE' and expires_at > now()) >= 10 then
    raise exception 'Limit 10 aktywnych ofert został osiągnięty';
  end if;

  execute format('select %I from public.countries where id = $1', p_resource)
    into v_available using v_country;
  if v_available < p_quantity then raise exception 'Brak wystarczającego zapasu'; end if;

  execute format('update public.countries set %I = %I - $1 where id = $2', p_resource, p_resource)
    using p_quantity, v_country;
  v_unit := greatest(1, ceil(p_total_price / p_quantity));

  insert into public.market_offers(
    seller_country_id, resource, quantity_total, quantity_remaining, unit_price, total_price_remaining
  ) values (v_country, p_resource, p_quantity, p_quantity, v_unit, p_total_price)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.market_buy_total(p_offer_id uuid, p_quantity numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer public.market_offers;
  v_buyer uuid := public.my_country_id();
  v_total numeric;
  v_remaining_total numeric;
  v_remaining_qty numeric;
begin
  if auth.uid() is null or v_buyer is null then raise exception 'Brak przypisanego państwa'; end if;
  if p_quantity is null or p_quantity < 1 or scale(p_quantity) > 0 then raise exception 'Nieprawidłowa ilość'; end if;

  perform public.market_expire_offers_internal();
  select * into v_offer from public.market_offers where id = p_offer_id for update;
  if not found or v_offer.status <> 'ACTIVE' or v_offer.expires_at <= now() then raise exception 'Oferta jest niedostępna'; end if;
  if v_offer.seller_country_id = v_buyer then raise exception 'Nie możesz kupić własnej oferty'; end if;
  if p_quantity > v_offer.quantity_remaining then raise exception 'Oferta nie ma już takiej ilości'; end if;

  v_total := case
    when p_quantity = v_offer.quantity_remaining then v_offer.total_price_remaining
    else greatest(1, floor(v_offer.total_price_remaining * p_quantity / v_offer.quantity_remaining))
  end;

  perform 1 from public.countries where id = least(v_buyer, v_offer.seller_country_id) for update;
  perform 1 from public.countries where id = greatest(v_buyer, v_offer.seller_country_id) for update;
  if (select balance from public.countries where id = v_buyer) < v_total then raise exception 'Niewystarczające środki'; end if;

  update public.countries set balance = balance - v_total where id = v_buyer;
  execute format('update public.countries set %I = %I + $1 where id = $2', v_offer.resource, v_offer.resource)
    using p_quantity, v_buyer;
  update public.countries set balance = balance + v_total where id = v_offer.seller_country_id;

  v_remaining_qty := v_offer.quantity_remaining - p_quantity;
  v_remaining_total := v_offer.total_price_remaining - v_total;
  update public.market_offers
  set quantity_remaining = v_remaining_qty,
      total_price_remaining = v_remaining_total,
      unit_price = case when v_remaining_qty > 0 then greatest(1, ceil(v_remaining_total / v_remaining_qty)) else unit_price end,
      status = case when v_remaining_qty = 0 then 'SOLD' else 'ACTIVE' end
  where id = p_offer_id;

  if v_remaining_qty = 0 then
    update public.market_negotiations set status = 'CANCELLED', updated_at = now()
    where offer_id = p_offer_id and status = 'PENDING';
  end if;

  insert into public.market_sales(
    offer_id, seller_country_id, buyer_country_id, resource, quantity, unit_price, total_price
  ) values (
    p_offer_id, v_offer.seller_country_id, v_buyer, v_offer.resource, p_quantity,
    greatest(1, ceil(v_total / p_quantity)), v_total
  );

  insert into public.transactions(country_id, kind, label, amount_kr, actor_id, details) values
    (v_buyer, 'MARKET_BUY', 'Zakup na rynku: ' || v_offer.resource, -v_total, auth.uid(),
      jsonb_build_object('offer_id', p_offer_id, 'quantity', p_quantity, 'total_price', v_total, 'seller_country_id', v_offer.seller_country_id)),
    (v_offer.seller_country_id, 'MARKET_SELL', 'Sprzedaż na rynku: ' || v_offer.resource, v_total, auth.uid(),
      jsonb_build_object('offer_id', p_offer_id, 'quantity', p_quantity, 'total_price', v_total, 'buyer_country_id', v_buyer));

  return jsonb_build_object('ok', true, 'quantity', p_quantity, 'total', v_total);
end;
$$;

-- Consistent lock order for negotiations: offer first, negotiation second.
create or replace function public.market_respond_negotiation_total(
  p_negotiation_id uuid, p_action text, p_quantity numeric default null, p_total_price numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n public.market_negotiations;
  o public.market_offers;
  v_offer_id uuid;
  v_actor uuid := public.my_country_id();
  v_total numeric;
  v_offer_share numeric;
begin
  if auth.uid() is null or v_actor is null then raise exception 'Brak przypisanego państwa'; end if;

  select offer_id into v_offer_id from public.market_negotiations where id = p_negotiation_id;
  if v_offer_id is null then raise exception 'Nie znaleziono negocjacji'; end if;

  select * into o from public.market_offers where id = v_offer_id for update;
  if not found or o.status <> 'ACTIVE' or o.expires_at <= now() then raise exception 'Oferta jest niedostępna'; end if;

  select * into n from public.market_negotiations where id = p_negotiation_id for update;
  if not found or n.offer_id <> o.id or n.status <> 'PENDING' or n.expires_at <= now() then
    raise exception 'Negocjacja nie jest aktywna';
  end if;

  if p_action = 'REJECT' then
    if v_actor not in (n.buyer_country_id, o.seller_country_id) then raise exception 'Brak uprawnień'; end if;
    update public.market_negotiations set status = 'REJECTED', updated_at = now() where id = n.id;
    return jsonb_build_object('ok', true);
  elsif p_action = 'COUNTER' then
    if (v_actor = o.seller_country_id and n.last_offer_by <> 'BUYER')
       or (v_actor = n.buyer_country_id and n.last_offer_by <> 'SELLER')
       or v_actor not in (o.seller_country_id, n.buyer_country_id) then
      raise exception 'Teraz ruch drugiej strony';
    end if;
    if p_quantity is null or p_quantity < 1 or scale(p_quantity) > 0
       or p_quantity > o.quantity_remaining or p_total_price is null
       or p_total_price < p_quantity or scale(p_total_price) > 0 then
      raise exception 'Nieprawidłowa kontroferta';
    end if;
    update public.market_negotiations
    set quantity = p_quantity,
        unit_price = greatest(1, ceil(p_total_price / p_quantity)),
        total_price = p_total_price,
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

  if n.quantity > o.quantity_remaining then raise exception 'Oferta nie ma już takiej ilości'; end if;
  v_total := n.total_price;
  v_offer_share := case
    when n.quantity = o.quantity_remaining then o.total_price_remaining
    else floor(o.total_price_remaining * n.quantity / o.quantity_remaining)
  end;

  perform 1 from public.countries where id = least(n.buyer_country_id, o.seller_country_id) for update;
  perform 1 from public.countries where id = greatest(n.buyer_country_id, o.seller_country_id) for update;
  if (select balance from public.countries where id = n.buyer_country_id) < v_total then
    raise exception 'Kupujący nie ma wystarczających środków';
  end if;

  update public.countries set balance = balance - v_total where id = n.buyer_country_id;
  execute format('update public.countries set %I = %I + $1 where id = $2', o.resource, o.resource)
    using n.quantity, n.buyer_country_id;
  update public.countries set balance = balance + v_total where id = o.seller_country_id;

  update public.market_offers
  set quantity_remaining = quantity_remaining - n.quantity,
      total_price_remaining = greatest(0, total_price_remaining - v_offer_share),
      unit_price = case
        when quantity_remaining - n.quantity > 0
        then greatest(1, ceil(greatest(0, total_price_remaining - v_offer_share) / (quantity_remaining - n.quantity)))
        else unit_price
      end,
      status = case when quantity_remaining - n.quantity = 0 then 'SOLD' else 'ACTIVE' end
  where id = o.id;

  if o.quantity_remaining - n.quantity = 0 then
    update public.market_negotiations set status = 'CANCELLED', updated_at = now()
    where offer_id = o.id and status = 'PENDING' and id <> n.id;
  end if;

  insert into public.market_sales(
    offer_id, seller_country_id, buyer_country_id, resource, quantity, unit_price, total_price
  ) values (
    o.id, o.seller_country_id, n.buyer_country_id, o.resource, n.quantity,
    greatest(1, ceil(v_total / n.quantity)), v_total
  );

  insert into public.transactions(country_id, kind, label, amount_kr, actor_id, details) values
    (n.buyer_country_id, 'MARKET_BUY', 'Zakup po negocjacji: ' || o.resource, -v_total, auth.uid(),
      jsonb_build_object('offer_id', o.id, 'quantity', n.quantity, 'total_price', v_total, 'seller_country_id', o.seller_country_id)),
    (o.seller_country_id, 'MARKET_SELL', 'Sprzedaż po negocjacji: ' || o.resource, v_total, auth.uid(),
      jsonb_build_object('offer_id', o.id, 'quantity', n.quantity, 'total_price', v_total, 'buyer_country_id', n.buyer_country_id));

  update public.market_negotiations set status = 'ACCEPTED', updated_at = now() where id = n.id;
  return jsonb_build_object('ok', true, 'quantity', n.quantity, 'total', v_total);
end;
$$;

-- Append-only market audit trail. Rows are created only by trusted triggers.
create table if not exists public.market_audit_events (
  id bigint generated always as identity primary key,
  offer_id uuid,
  negotiation_id uuid,
  event_type text not null,
  actor_country_id uuid,
  counterparty_country_id uuid,
  resource text,
  quantity numeric,
  total_price numeric,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists market_audit_events_offer_idx
  on public.market_audit_events(offer_id, created_at desc);
create index if not exists market_audit_events_actor_idx
  on public.market_audit_events(actor_country_id, created_at desc);

alter table public.market_audit_events enable row level security;
revoke all on public.market_audit_events from public, anon, authenticated;
grant select on public.market_audit_events to authenticated;

drop policy if exists market_audit_events_read on public.market_audit_events;
create policy market_audit_events_read on public.market_audit_events
for select to authenticated
using (
  public.is_admin(auth.uid())
  or actor_country_id = public.my_country_id()
  or counterparty_country_id = public.my_country_id()
  or exists (
    select 1 from public.market_offers o
    where o.id = market_audit_events.offer_id and o.seller_country_id = public.my_country_id()
  )
  or exists (
    select 1 from public.market_negotiations n
    where n.id = market_audit_events.negotiation_id and n.buyer_country_id = public.my_country_id()
  )
);

create or replace function public.market_audit_offer_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event text;
begin
  if tg_op = 'INSERT' then
    insert into public.market_audit_events(
      offer_id, event_type, actor_country_id, resource, quantity, total_price, details
    ) values (
      new.id, 'OFFER_CREATED', public.my_country_id(), new.resource,
      new.quantity_total, new.total_price_remaining,
      jsonb_build_object('expires_at', new.expires_at)
    );
    return new;
  end if;

  if old.status is distinct from new.status then
    v_event := case new.status
      when 'CANCELLED' then 'OFFER_CANCELLED'
      when 'EXPIRED' then 'OFFER_EXPIRED'
      when 'SOLD' then 'OFFER_COMPLETED'
      else 'OFFER_STATUS_CHANGED'
    end;
    insert into public.market_audit_events(
      offer_id, event_type, actor_country_id, resource, quantity, total_price, details
    ) values (
      new.id, v_event, public.my_country_id(), new.resource,
      old.quantity_remaining, old.total_price_remaining,
      jsonb_build_object('old_status', old.status, 'new_status', new.status)
    );
  elsif old.total_price_remaining is distinct from new.total_price_remaining
        and old.quantity_remaining is not distinct from new.quantity_remaining then
    insert into public.market_audit_events(
      offer_id, event_type, actor_country_id, resource, quantity, total_price, details
    ) values (
      new.id, 'OFFER_PRICE_CHANGED', public.my_country_id(), new.resource,
      new.quantity_remaining, new.total_price_remaining,
      jsonb_build_object('old_total_price', old.total_price_remaining, 'new_total_price', new.total_price_remaining)
    );
  end if;
  return new;
end;
$$;

create or replace function public.market_audit_negotiation_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event text;
  v_offer public.market_offers;
begin
  select * into v_offer from public.market_offers where id = new.offer_id;

  if tg_op = 'INSERT' then
    insert into public.market_audit_events(
      offer_id, negotiation_id, event_type, actor_country_id, counterparty_country_id,
      resource, quantity, total_price, details
    ) values (
      new.offer_id, new.id, 'NEGOTIATION_CREATED', new.buyer_country_id,
      v_offer.seller_country_id, v_offer.resource, new.quantity, new.total_price,
      jsonb_build_object('last_offer_by', new.last_offer_by, 'expires_at', new.expires_at)
    );
    return new;
  end if;

  if old.status is distinct from new.status then
    v_event := case new.status
      when 'ACCEPTED' then 'NEGOTIATION_ACCEPTED'
      when 'REJECTED' then 'NEGOTIATION_REJECTED'
      when 'CANCELLED' then 'NEGOTIATION_CANCELLED'
      when 'EXPIRED' then 'NEGOTIATION_EXPIRED'
      else 'NEGOTIATION_STATUS_CHANGED'
    end;
  elsif old.quantity is distinct from new.quantity or old.total_price is distinct from new.total_price then
    v_event := 'NEGOTIATION_COUNTEROFFER';
  else
    return new;
  end if;

  insert into public.market_audit_events(
    offer_id, negotiation_id, event_type, actor_country_id, counterparty_country_id,
    resource, quantity, total_price, details
  ) values (
    new.offer_id, new.id, v_event, public.my_country_id(),
    case when public.my_country_id() = new.buyer_country_id then v_offer.seller_country_id else new.buyer_country_id end,
    v_offer.resource, new.quantity, new.total_price,
    jsonb_build_object('last_offer_by', new.last_offer_by, 'status', new.status)
  );
  return new;
end;
$$;

drop trigger if exists market_audit_offer_events on public.market_offers;
create trigger market_audit_offer_events
after insert or update on public.market_offers
for each row execute function public.market_audit_offer_trigger();

drop trigger if exists market_audit_negotiation_events on public.market_negotiations;
create trigger market_audit_negotiation_events
after insert or update on public.market_negotiations
for each row execute function public.market_audit_negotiation_trigger();

-- Sales are immutable completed trades and provide the exact transaction values.
create or replace function public.market_audit_sale_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.market_audit_events(
    offer_id, event_type, actor_country_id, counterparty_country_id,
    resource, quantity, total_price, details
  ) values (
    new.offer_id, 'MARKET_TRADE', new.buyer_country_id, new.seller_country_id,
    new.resource, new.quantity, new.total_price,
    jsonb_build_object('sale_id', new.id, 'unit_price', new.unit_price)
  );
  return new;
end;
$$;

drop trigger if exists market_audit_sale_events on public.market_sales;
create trigger market_audit_sale_events
after insert on public.market_sales
for each row execute function public.market_audit_sale_trigger();

revoke all on function public.market_audit_offer_trigger() from public, anon, authenticated;
revoke all on function public.market_audit_negotiation_trigger() from public, anon, authenticated;
revoke all on function public.market_audit_sale_trigger() from public, anon, authenticated;

notify pgrst, 'reload schema';
