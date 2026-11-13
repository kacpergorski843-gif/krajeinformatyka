-- 00742: transactional player market with escrow, partial fills and price negotiations.
create table if not exists public.market_offers (
  id uuid primary key default gen_random_uuid(),
  seller_country_id uuid not null references public.countries(id) on delete cascade,
  resource text not null check (resource in ('coal','oil','copper','iron','uranium','soldier_packs','tank_packs','missile_1','missile_2','missile_3')),
  quantity_total numeric(30,0) not null check (quantity_total > 0 and scale(quantity_total)=0),
  quantity_remaining numeric(30,0) not null check (quantity_remaining >= 0 and scale(quantity_remaining)=0),
  unit_price numeric(30,0) not null check (unit_price > 0 and scale(unit_price)=0),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','SOLD','CANCELLED','EXPIRED')),
  constraint market_offer_expiry check (expires_at > created_at)
);
create index if not exists market_offers_active_sort_idx on public.market_offers(resource, unit_price, created_at) where status='ACTIVE';
create index if not exists market_offers_seller_idx on public.market_offers(seller_country_id, created_at desc);

create table if not exists public.market_sales (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.market_offers(id),
  seller_country_id uuid not null references public.countries(id),
  buyer_country_id uuid not null references public.countries(id),
  resource text not null,
  quantity numeric(30,0) not null check (quantity > 0),
  unit_price numeric(30,0) not null check (unit_price > 0),
  total_price numeric(30,0) not null check (total_price > 0),
  created_at timestamptz not null default now()
);
create index if not exists market_sales_resource_date_idx on public.market_sales(resource, created_at desc);
create index if not exists market_sales_country_date_idx on public.market_sales(buyer_country_id, created_at desc);

-- Public price history intentionally exposes no country identifiers.
create or replace view public.market_price_history as
select resource, created_at, unit_price, quantity
from public.market_sales;
grant select on public.market_price_history to authenticated;

create table if not exists public.market_negotiations (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.market_offers(id),
  buyer_country_id uuid not null references public.countries(id),
  quantity numeric(30,0) not null check (quantity > 0 and scale(quantity)=0),
  unit_price numeric(30,0) not null check (unit_price > 0 and scale(unit_price)=0),
  last_offer_by text not null check (last_offer_by in ('BUYER','SELLER')),
  status text not null default 'PENDING' check (status in ('PENDING','ACCEPTED','REJECTED','CANCELLED','EXPIRED')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists market_negotiations_buyer_idx on public.market_negotiations(buyer_country_id, created_at desc);
create unique index if not exists market_negotiations_one_pending_idx
  on public.market_negotiations(offer_id,buyer_country_id) where status='PENDING';

alter table public.market_offers enable row level security;
alter table public.market_sales enable row level security;
alter table public.market_negotiations enable row level security;
grant select on public.market_offers, public.market_sales, public.market_negotiations to authenticated;
create or replace function public.market_is_offer_seller(p_offer_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.market_offers where id=p_offer_id and seller_country_id=public.my_country_id());
$$;
revoke all on function public.market_is_offer_seller(uuid) from public;
grant execute on function public.market_is_offer_seller(uuid) to authenticated;
drop policy if exists market_offers_read on public.market_offers;
create policy market_offers_read on public.market_offers for select to authenticated using (status='ACTIVE' or public.my_country_id()=seller_country_id);
drop policy if exists market_sales_read on public.market_sales;
create policy market_sales_read on public.market_sales for select to authenticated using (public.my_country_id() in (seller_country_id,buyer_country_id) or public.is_admin(auth.uid()));
drop policy if exists market_negotiations_read on public.market_negotiations;
create policy market_negotiations_read on public.market_negotiations for select to authenticated using (public.my_country_id()=buyer_country_id or public.market_is_offer_seller(offer_id));

create or replace function public.market_expire_offers()
returns integer language plpgsql security definer set search_path=public as $$
declare r record; v_count integer:=0;
begin
 for r in select * from public.market_offers where status='ACTIVE' and expires_at<=now() for update skip locked loop
   update public.countries set
     coal=coal+case when r.resource='coal' then r.quantity_remaining else 0 end,
     oil=oil+case when r.resource='oil' then r.quantity_remaining else 0 end,
     copper=copper+case when r.resource='copper' then r.quantity_remaining else 0 end,
     iron=iron+case when r.resource='iron' then r.quantity_remaining else 0 end,
     uranium=uranium+case when r.resource='uranium' then r.quantity_remaining else 0 end,
     soldier_packs=soldier_packs+case when r.resource='soldier_packs' then r.quantity_remaining else 0 end,
     tank_packs=tank_packs+case when r.resource='tank_packs' then r.quantity_remaining else 0 end,
     missile_1=missile_1+case when r.resource='missile_1' then r.quantity_remaining else 0 end,
     missile_2=missile_2+case when r.resource='missile_2' then r.quantity_remaining else 0 end,
     missile_3=missile_3+case when r.resource='missile_3' then r.quantity_remaining else 0 end
   where id=r.seller_country_id;
   update public.market_offers set status='EXPIRED',quantity_remaining=0 where id=r.id;
   update public.market_negotiations set status='EXPIRED',updated_at=now() where offer_id=r.id and status='PENDING';
   v_count:=v_count+1;
 end loop;
 return v_count;
end $$;

create or replace function public.market_create_offer(p_resource text,p_quantity numeric,p_unit_price numeric)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_country uuid:=public.my_country_id(); v_id uuid; v_available numeric;
begin
 if auth.uid() is null or v_country is null then raise exception 'Brak przypisanego państwa'; end if;
 perform public.assert_can_manage(v_country);
 if p_resource not in ('coal','oil','copper','iron','uranium','soldier_packs','tank_packs','missile_1','missile_2','missile_3') then raise exception 'Nieobsługiwany towar'; end if;
 if p_quantity is null or p_quantity<1 or scale(p_quantity)>0 or p_unit_price is null or p_unit_price<1 or scale(p_unit_price)>0 then raise exception 'Ilość i cena muszą być dodatnimi liczbami całkowitymi'; end if;
 perform public.market_expire_offers();
 perform 1 from public.countries where id=v_country for update;
 if (select count(*) from public.market_offers where seller_country_id=v_country and status='ACTIVE' and expires_at>now())>=10 then raise exception 'Limit 10 aktywnych ofert został osiągnięty'; end if;
 execute format('select %I from public.countries where id=$1',p_resource) into v_available using v_country;
 if v_available<p_quantity then raise exception 'Brak wystarczającego zapasu'; end if;
 execute format('update public.countries set %I=%I-$1 where id=$2',p_resource,p_resource) using p_quantity,v_country;
 insert into public.market_offers(seller_country_id,resource,quantity_total,quantity_remaining,unit_price) values(v_country,p_resource,p_quantity,p_quantity,p_unit_price) returning id into v_id;
 return v_id;
end $$;

create or replace function public.market_update_offer_price(p_offer_id uuid,p_unit_price numeric)
returns void language plpgsql security definer set search_path=public as $$
declare v_offer public.market_offers;
begin
 if p_unit_price is null or p_unit_price<1 or scale(p_unit_price)>0 then raise exception 'Nieprawidłowa cena'; end if;
 select * into v_offer from public.market_offers where id=p_offer_id for update;
 if not found or public.my_country_id() is null or v_offer.seller_country_id<>public.my_country_id() then raise exception 'Nie znaleziono oferty'; end if;
 if v_offer.status<>'ACTIVE' or v_offer.expires_at<=now() then raise exception 'Oferta nie jest aktywna'; end if;
 update public.market_offers set unit_price=p_unit_price where id=p_offer_id;
end $$;

create or replace function public.market_cancel_offer(p_offer_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_offer public.market_offers;
begin
 select * into v_offer from public.market_offers where id=p_offer_id for update;
 if not found or public.my_country_id() is null or v_offer.seller_country_id<>public.my_country_id() then raise exception 'Nie znaleziono oferty'; end if;
 if v_offer.status<>'ACTIVE' then raise exception 'Oferta nie jest aktywna'; end if;
 update public.countries set
  coal=coal+case when v_offer.resource='coal' then v_offer.quantity_remaining else 0 end,
  oil=oil+case when v_offer.resource='oil' then v_offer.quantity_remaining else 0 end,
  copper=copper+case when v_offer.resource='copper' then v_offer.quantity_remaining else 0 end,
  iron=iron+case when v_offer.resource='iron' then v_offer.quantity_remaining else 0 end,
  uranium=uranium+case when v_offer.resource='uranium' then v_offer.quantity_remaining else 0 end,
  soldier_packs=soldier_packs+case when v_offer.resource='soldier_packs' then v_offer.quantity_remaining else 0 end,
  tank_packs=tank_packs+case when v_offer.resource='tank_packs' then v_offer.quantity_remaining else 0 end,
  missile_1=missile_1+case when v_offer.resource='missile_1' then v_offer.quantity_remaining else 0 end,
  missile_2=missile_2+case when v_offer.resource='missile_2' then v_offer.quantity_remaining else 0 end,
  missile_3=missile_3+case when v_offer.resource='missile_3' then v_offer.quantity_remaining else 0 end
 where id=v_offer.seller_country_id;
 update public.market_offers set status='CANCELLED',quantity_remaining=0 where id=p_offer_id;
 update public.market_negotiations set status='CANCELLED',updated_at=now() where offer_id=p_offer_id and status='PENDING';
end $$;

create or replace function public.market_buy(p_offer_id uuid,p_quantity numeric)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_offer public.market_offers; v_buyer uuid:=public.my_country_id(); v_total numeric;
begin
 if auth.uid() is null or v_buyer is null then raise exception 'Brak przypisanego państwa'; end if;
 if p_quantity is null or p_quantity<1 or scale(p_quantity)>0 then raise exception 'Nieprawidłowa ilość'; end if;
 perform public.market_expire_offers();
 select * into v_offer from public.market_offers where id=p_offer_id for update;
 if not found or v_offer.status<>'ACTIVE' or v_offer.expires_at<=now() then raise exception 'Oferta jest niedostępna'; end if;
 if v_offer.seller_country_id=v_buyer then raise exception 'Nie możesz kupić własnej oferty'; end if;
 if p_quantity>v_offer.quantity_remaining then raise exception 'Oferta nie ma już takiej ilości'; end if;
 v_total:=p_quantity*v_offer.unit_price;
 perform 1 from public.countries where id=least(v_buyer,v_offer.seller_country_id) for update;
 perform 1 from public.countries where id=greatest(v_buyer,v_offer.seller_country_id) for update;
 if (select balance from public.countries where id=v_buyer)<v_total then raise exception 'Niewystarczające środki'; end if;
 update public.countries set balance=balance-v_total where id=v_buyer;
 execute format('update public.countries set %I=%I+$1 where id=$2',v_offer.resource,v_offer.resource) using p_quantity,v_buyer;
 update public.countries set balance=balance+v_total where id=v_offer.seller_country_id;
 update public.market_offers set quantity_remaining=quantity_remaining-p_quantity,status=case when quantity_remaining-p_quantity=0 then 'SOLD' else 'ACTIVE' end where id=p_offer_id;
 if v_offer.quantity_remaining-p_quantity=0 then
   update public.market_negotiations set status='CANCELLED',updated_at=now() where offer_id=p_offer_id and status='PENDING';
 end if;
 insert into public.market_sales(offer_id,seller_country_id,buyer_country_id,resource,quantity,unit_price,total_price) values(p_offer_id,v_offer.seller_country_id,v_buyer,v_offer.resource,p_quantity,v_offer.unit_price,v_total);
 insert into public.transactions(country_id,kind,label,amount_kr,actor_id,details) values
 (v_buyer,'MARKET_BUY','Zakup na rynku: '||v_offer.resource,-v_total,auth.uid(),jsonb_build_object('offer_id',p_offer_id,'quantity',p_quantity,'unit_price',v_offer.unit_price,'seller_country_id',v_offer.seller_country_id)),
 (v_offer.seller_country_id,'MARKET_SELL','Sprzedaż na rynku: '||v_offer.resource,v_total,auth.uid(),jsonb_build_object('offer_id',p_offer_id,'quantity',p_quantity,'unit_price',v_offer.unit_price,'buyer_country_id',v_buyer));
 return jsonb_build_object('ok',true,'quantity',p_quantity,'total',v_total);
end $$;

create or replace function public.market_propose(p_offer_id uuid,p_quantity numeric,p_unit_price numeric)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_offer public.market_offers; v_buyer uuid:=public.my_country_id(); v_id uuid;
begin
 if v_buyer is null or auth.uid() is null then raise exception 'Brak przypisanego państwa'; end if;
 if p_quantity is null or p_quantity<1 or scale(p_quantity)>0 or p_unit_price is null or p_unit_price<1 or scale(p_unit_price)>0 then raise exception 'Nieprawidłowa ilość lub cena'; end if;
 select * into v_offer from public.market_offers where id=p_offer_id for update;
 if not found or v_offer.status<>'ACTIVE' or v_offer.expires_at<=now() then raise exception 'Oferta jest niedostępna'; end if;
 if v_offer.seller_country_id=v_buyer then raise exception 'Nie możesz negocjować własnej oferty'; end if;
 if p_quantity>v_offer.quantity_remaining then raise exception 'Oferta nie ma takiej ilości'; end if;
 insert into public.market_negotiations(offer_id,buyer_country_id,quantity,unit_price,last_offer_by,expires_at) values(p_offer_id,v_buyer,p_quantity,p_unit_price,'BUYER',least(now()+interval '7 days',v_offer.expires_at)) returning id into v_id;
 return v_id;
end $$;

create or replace function public.market_respond_negotiation(p_negotiation_id uuid,p_action text,p_quantity numeric default null,p_unit_price numeric default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare n public.market_negotiations; o public.market_offers; v_actor uuid:=public.my_country_id(); v_total numeric;
begin
 if auth.uid() is null or v_actor is null then raise exception 'Brak przypisanego państwa'; end if;
 select * into n from public.market_negotiations where id=p_negotiation_id for update;
 if not found or n.status<>'PENDING' or n.expires_at<=now() then raise exception 'Negocjacja nie jest aktywna'; end if;
 select * into o from public.market_offers where id=n.offer_id for update;
 if not found or o.status<>'ACTIVE' or o.expires_at<=now() then raise exception 'Oferta jest niedostępna'; end if;
 if p_action='REJECT' then
   if v_actor is null or v_actor not in (n.buyer_country_id,o.seller_country_id) then raise exception 'Brak uprawnień'; end if;
   update public.market_negotiations set status='REJECTED',updated_at=now() where id=n.id; return jsonb_build_object('ok',true);
 elsif p_action='COUNTER' then
   if (v_actor=o.seller_country_id and n.last_offer_by<>'BUYER') or (v_actor=n.buyer_country_id and n.last_offer_by<>'SELLER') or v_actor not in (o.seller_country_id,n.buyer_country_id) then
     raise exception 'Teraz ruch drugiej strony';
   end if;
   if p_quantity is null or p_quantity<1 or scale(p_quantity)>0 or p_quantity>o.quantity_remaining or p_unit_price is null or p_unit_price<1 or scale(p_unit_price)>0 then raise exception 'Nieprawidłowa kontroferta'; end if;
   update public.market_negotiations set quantity=p_quantity,unit_price=p_unit_price,last_offer_by=case when v_actor=o.seller_country_id then 'SELLER' else 'BUYER' end,updated_at=now() where id=n.id; return jsonb_build_object('ok',true);
 elsif p_action='ACCEPT' then
   if v_actor<>o.seller_country_id or n.last_offer_by<>'BUYER' then raise exception 'Nie możesz teraz zaakceptować tej propozycji'; end if;
 elsif p_action='ACCEPT_COUNTER' then
   if v_actor<>n.buyer_country_id or n.last_offer_by<>'SELLER' then raise exception 'Nie możesz teraz zaakceptować tej kontroferty'; end if;
 else raise exception 'Nieznana operacja'; end if;
 if n.quantity>o.quantity_remaining then raise exception 'Oferta nie ma już takiej ilości'; end if;
 v_total:=n.quantity*n.unit_price;
 perform 1 from public.countries where id=least(n.buyer_country_id,o.seller_country_id) for update;
 perform 1 from public.countries where id=greatest(n.buyer_country_id,o.seller_country_id) for update;
 if (select balance from public.countries where id=n.buyer_country_id)<v_total then raise exception 'Kupujący nie ma wystarczających środków'; end if;
 update public.countries set balance=balance-v_total where id=n.buyer_country_id;
 execute format('update public.countries set %I=%I+$1 where id=$2',o.resource,o.resource) using n.quantity,n.buyer_country_id;
 update public.countries set balance=balance+v_total where id=o.seller_country_id;
 update public.market_offers set quantity_remaining=quantity_remaining-n.quantity,status=case when quantity_remaining-n.quantity=0 then 'SOLD' else 'ACTIVE' end where id=o.id;
 if o.quantity_remaining-n.quantity=0 then
   update public.market_negotiations set status='CANCELLED',updated_at=now() where offer_id=o.id and status='PENDING' and id<>n.id;
 end if;
 insert into public.market_sales(offer_id,seller_country_id,buyer_country_id,resource,quantity,unit_price,total_price) values(o.id,o.seller_country_id,n.buyer_country_id,o.resource,n.quantity,n.unit_price,v_total);
 insert into public.transactions(country_id,kind,label,amount_kr,actor_id,details) values
 (n.buyer_country_id,'MARKET_BUY','Zakup po negocjacji: '||o.resource,-v_total,auth.uid(),jsonb_build_object('offer_id',o.id,'quantity',n.quantity,'unit_price',n.unit_price,'seller_country_id',o.seller_country_id)),
 (o.seller_country_id,'MARKET_SELL','Sprzedaż po negocjacji: '||o.resource,v_total,auth.uid(),jsonb_build_object('offer_id',o.id,'quantity',n.quantity,'unit_price',n.unit_price,'buyer_country_id',n.buyer_country_id));
 update public.market_negotiations set status='ACCEPTED',updated_at=now() where id=n.id;
 return jsonb_build_object('ok',true,'quantity',n.quantity,'total',v_total);
end $$;

revoke all on function public.market_expire_offers() from public;
revoke all on function public.market_create_offer(text,numeric,numeric) from public;
revoke all on function public.market_update_offer_price(uuid,numeric) from public;
revoke all on function public.market_cancel_offer(uuid) from public;
revoke all on function public.market_buy(uuid,numeric) from public;
revoke all on function public.market_propose(uuid,numeric,numeric) from public;
revoke all on function public.market_respond_negotiation(uuid,text,numeric,numeric) from public;
grant execute on function public.market_expire_offers() to authenticated;
grant execute on function public.market_create_offer(text,numeric,numeric) to authenticated;
grant execute on function public.market_update_offer_price(uuid,numeric) to authenticated;
grant execute on function public.market_cancel_offer(uuid) to authenticated;
grant execute on function public.market_buy(uuid,numeric) to authenticated;
grant execute on function public.market_propose(uuid,numeric,numeric) to authenticated;
grant execute on function public.market_respond_negotiation(uuid,text,numeric,numeric) to authenticated;
notify pgrst,'reload schema';
