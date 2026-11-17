-- 00765: harden market RPC access, lock order and immutable audit events.

-- Expiry is an internal operation invoked by SECURITY DEFINER market RPCs.
revoke all on function public.market_expire_offers() from public, anon, authenticated;
grant execute on function public.market_expire_offers() to service_role;

create or replace function public.market_respond_negotiation_total(p_negotiation_id uuid,p_action text,p_quantity numeric default null,p_total_price numeric default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare n public.market_negotiations; o public.market_offers; v_offer_id uuid; v_actor uuid:=public.my_country_id(); v_total numeric; v_offer_share numeric;
begin
 if auth.uid() is null or v_actor is null then raise exception 'Brak przypisanego państwa'; end if;
 -- Lock offer first, then negotiation. This is the shared lock order used by
 -- purchase, proposal and expiry paths, preventing lock-order inversion.
 select offer_id into v_offer_id from public.market_negotiations where id=p_negotiation_id;
 if v_offer_id is null then raise exception 'Nie znaleziono negocjacji'; end if;
 select * into o from public.market_offers where id=v_offer_id for update;
 if not found or o.status<>'ACTIVE' or o.expires_at<=now() then raise exception 'Oferta jest niedostępna'; end if;
 select * into n from public.market_negotiations where id=p_negotiation_id for update;
 if not found or n.offer_id<>o.id or n.status<>'PENDING' or n.expires_at<=now() then raise exception 'Negocjacja nie jest aktywna'; end if;
 if p_action='REJECT' then
   if v_actor not in (n.buyer_country_id,o.seller_country_id) then raise exception 'Brak uprawnień'; end if;
   update public.market_negotiations set status='REJECTED',updated_at=now() where id=n.id; return jsonb_build_object('ok',true);
 elsif p_action='COUNTER' then
   if (v_actor=o.seller_country_id and n.last_offer_by<>'BUYER') or (v_actor=n.buyer_country_id and n.last_offer_by<>'SELLER') or v_actor not in (o.seller_country_id,n.buyer_country_id) then raise exception 'Teraz ruch drugiej strony'; end if;
   if p_quantity is null or p_quantity<1 or scale(p_quantity)>0 or p_quantity>o.quantity_remaining or p_total_price is null or p_total_price<p_quantity or scale(p_total_price)>0 then raise exception 'Nieprawidłowa kontroferta'; end if;
   update public.market_negotiations set quantity=p_quantity,unit_price=greatest(1,ceil(p_total_price/p_quantity)),total_price=p_total_price,last_offer_by=case when v_actor=o.seller_country_id then 'SELLER' else 'BUYER' end,updated_at=now() where id=n.id;
   return jsonb_build_object('ok',true);
 elsif p_action='ACCEPT' then
   if v_actor<>o.seller_country_id or n.last_offer_by<>'BUYER' then raise exception 'Nie możesz teraz zaakceptować tej propozycji'; end if;
 elsif p_action='ACCEPT_COUNTER' then
   if v_actor<>n.buyer_country_id or n.last_offer_by<>'SELLER' then raise exception 'Nie możesz teraz zaakceptować tej kontroferty'; end if;
 else raise exception 'Nieznana operacja'; end if;
 if n.quantity>o.quantity_remaining then raise exception 'Oferta nie ma już takiej ilości'; end if;
 v_total:=n.total_price;
 v_offer_share:=case when n.quantity=o.quantity_remaining then o.total_price_remaining else floor(o.total_price_remaining*n.quantity/o.quantity_remaining) end;
 perform 1 from public.countries where id=least(n.buyer_country_id,o.seller_country_id) for update;
 perform 1 from public.countries where id=greatest(n.buyer_country_id,o.seller_country_id) for update;
 if (select balance from public.countries where id=n.buyer_country_id)<v_total then raise exception 'Kupujący nie ma wystarczających środków'; end if;
 update public.countries set balance=balance-v_total where id=n.buyer_country_id;
 execute format('update public.countries set %I=%I+$1 where id=$2',o.resource,o.resource) using n.quantity,n.buyer_country_id;
 update public.countries set balance=balance+v_total where id=o.seller_country_id;
 update public.market_offers set quantity_remaining=quantity_remaining-n.quantity,total_price_remaining=greatest(0,total_price_remaining-v_offer_share),
   unit_price=case when quantity_remaining-n.quantity>0 then greatest(1,ceil(greatest(0,total_price_remaining-v_offer_share)/(quantity_remaining-n.quantity))) else unit_price end,
   status=case when quantity_remaining-n.quantity=0 then 'SOLD' else 'ACTIVE' end where id=o.id;
 if o.quantity_remaining-n.quantity=0 then update public.market_negotiations set status='CANCELLED',updated_at=now() where offer_id=o.id and status='PENDING' and id<>n.id; end if;
 insert into public.market_sales(offer_id,seller_country_id,buyer_country_id,resource,quantity,unit_price,total_price)
 values(o.id,o.seller_country_id,n.buyer_country_id,o.resource,n.quantity,greatest(1,ceil(v_total/n.quantity)),v_total);
 insert into public.transactions(country_id,kind,label,amount_kr,actor_id,details) values
 (n.buyer_country_id,'MARKET_BUY','Zakup po negocjacji: '||o.resource,-v_total,auth.uid(),jsonb_build_object('offer_id',o.id,'quantity',n.quantity,'total_price',v_total,'seller_country_id',o.seller_country_id)),
 (o.seller_country_id,'MARKET_SELL','Sprzedaż po negocjacji: '||o.resource,v_total,auth.uid(),jsonb_build_object('offer_id',o.id,'quantity',n.quantity,'total_price',v_total,'buyer_country_id',n.buyer_country_id));
 update public.market_negotiations set status='ACCEPTED',updated_at=now() where id=n.id;
 return jsonb_build_object('ok',true,'quantity',n.quantity,'total',v_total);
end $$;

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

create index if not exists market_audit_events_offer_created_idx on public.market_audit_events(offer_id,created_at desc);
create index if not exists market_audit_events_actor_created_idx on public.market_audit_events(actor_country_id,created_at desc);
create index if not exists market_audit_events_counterparty_created_idx on public.market_audit_events(counterparty_country_id,created_at desc);

alter table public.market_audit_events enable row level security;
revoke all on public.market_audit_events from public, anon, authenticated;
grant select on public.market_audit_events to authenticated;
drop policy if exists market_audit_events_participants_read on public.market_audit_events;
create policy market_audit_events_participants_read on public.market_audit_events
for select to authenticated using (
  public.is_admin(auth.uid())
  or actor_country_id=public.my_country_id()
  or counterparty_country_id=public.my_country_id()
);

create or replace function public.market_audit_offer_event()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_event text;
begin
  if tg_op='INSERT' then
    insert into public.market_audit_events(offer_id,event_type,actor_country_id,resource,quantity,total_price,details)
    values(new.id,'OFFER_CREATED',new.seller_country_id,new.resource,new.quantity_total,new.total_price_remaining,
      jsonb_build_object('expires_at',new.expires_at));
    return new;
  end if;
  if old.status is distinct from new.status then
    v_event:=case new.status when 'CANCELLED' then 'OFFER_CANCELLED'
      when 'EXPIRED' then 'OFFER_EXPIRED' when 'SOLD' then 'OFFER_COMPLETED'
      else 'OFFER_STATUS_CHANGED' end;
    insert into public.market_audit_events(offer_id,event_type,actor_country_id,resource,quantity,total_price,details)
    values(new.id,v_event,new.seller_country_id,new.resource,old.quantity_remaining,old.total_price_remaining,
      jsonb_build_object('old_status',old.status,'new_status',new.status));
  elsif old.total_price_remaining is distinct from new.total_price_remaining
    and old.quantity_remaining is not distinct from new.quantity_remaining then
    insert into public.market_audit_events(offer_id,event_type,actor_country_id,resource,quantity,total_price,details)
    values(new.id,'OFFER_PRICE_CHANGED',new.seller_country_id,new.resource,new.quantity_remaining,new.total_price_remaining,
      jsonb_build_object('old_total',old.total_price_remaining,'new_total',new.total_price_remaining));
  end if;
  return new;
end $$;

create or replace function public.market_audit_negotiation_event()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_offer public.market_offers; v_event text; v_actor uuid; v_other uuid;
begin
  select * into v_offer from public.market_offers where id=new.offer_id;
  if tg_op='INSERT' then
    insert into public.market_audit_events(offer_id,negotiation_id,event_type,actor_country_id,counterparty_country_id,resource,quantity,total_price,details)
    values(new.offer_id,new.id,'NEGOTIATION_CREATED',new.buyer_country_id,v_offer.seller_country_id,v_offer.resource,new.quantity,new.total_price,
      jsonb_build_object('last_offer_by',new.last_offer_by,'expires_at',new.expires_at));
    return new;
  end if;
  if old.status is distinct from new.status then
    v_event:=case new.status when 'ACCEPTED' then 'NEGOTIATION_ACCEPTED'
      when 'REJECTED' then 'NEGOTIATION_REJECTED' when 'CANCELLED' then 'NEGOTIATION_CANCELLED'
      when 'EXPIRED' then 'NEGOTIATION_EXPIRED' else 'NEGOTIATION_STATUS_CHANGED' end;
  elsif old.quantity is distinct from new.quantity or old.total_price is distinct from new.total_price then
    v_event:='NEGOTIATION_COUNTEROFFER';
  else return new;
  end if;
  v_actor:=case
    when public.my_country_id() in (new.buyer_country_id,v_offer.seller_country_id)
      then public.my_country_id()
    else new.buyer_country_id
  end;
  v_other:=case when v_actor=new.buyer_country_id
    then v_offer.seller_country_id else new.buyer_country_id end;
  insert into public.market_audit_events(offer_id,negotiation_id,event_type,actor_country_id,counterparty_country_id,resource,quantity,total_price,details)
  values(new.offer_id,new.id,v_event,v_actor,v_other,v_offer.resource,new.quantity,new.total_price,
    jsonb_build_object('last_offer_by',new.last_offer_by,'status',new.status));
  return new;
end $$;

create or replace function public.market_audit_sale_event()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.market_audit_events(offer_id,event_type,actor_country_id,counterparty_country_id,resource,quantity,total_price,details)
  values(new.offer_id,'MARKET_TRADE',new.buyer_country_id,new.seller_country_id,new.resource,new.quantity,new.total_price,
    jsonb_build_object('sale_id',new.id,'unit_price',new.unit_price));
  return new;
end $$;

drop trigger if exists market_audit_offer_events on public.market_offers;
create trigger market_audit_offer_events after insert or update on public.market_offers
for each row execute function public.market_audit_offer_event();
drop trigger if exists market_audit_negotiation_events on public.market_negotiations;
create trigger market_audit_negotiation_events after insert or update on public.market_negotiations
for each row execute function public.market_audit_negotiation_event();
drop trigger if exists market_audit_sale_events on public.market_sales;
create trigger market_audit_sale_events after insert on public.market_sales
for each row execute function public.market_audit_sale_event();

revoke all on function public.market_audit_offer_event() from public,anon,authenticated;
revoke all on function public.market_audit_negotiation_event() from public,anon,authenticated;
revoke all on function public.market_audit_sale_event() from public,anon,authenticated;

notify pgrst,'reload schema';
