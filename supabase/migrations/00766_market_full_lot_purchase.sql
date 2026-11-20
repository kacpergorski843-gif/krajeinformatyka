-- 00766: market purchases must buy the complete remaining offer.
-- The RPC enforces this server-side so partial purchases cannot bypass the UI.
create or replace function public.market_buy_total(p_offer_id uuid,p_quantity numeric)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_offer public.market_offers; v_buyer uuid:=public.my_country_id(); v_total numeric; v_remaining_total numeric; v_remaining_qty numeric;
begin
 if auth.uid() is null or v_buyer is null then raise exception 'Brak przypisanego państwa'; end if;
 if p_quantity is null or p_quantity<1 or scale(p_quantity)>0 then raise exception 'Nieprawidłowa ilość'; end if;
 perform public.market_expire_offers();
 select * into v_offer from public.market_offers where id=p_offer_id for update;
 if not found or v_offer.status<>'ACTIVE' or v_offer.expires_at<=now() then raise exception 'Oferta jest niedostępna'; end if;
 if v_offer.seller_country_id=v_buyer then raise exception 'Nie możesz kupić własnej oferty'; end if;
 if p_quantity<>v_offer.quantity_remaining then raise exception 'Zakup obejmuje całą pozostałą ilość oferty'; end if;
 v_total:=v_offer.total_price_remaining;
 perform 1 from public.countries where id=least(v_buyer,v_offer.seller_country_id) for update;
 perform 1 from public.countries where id=greatest(v_buyer,v_offer.seller_country_id) for update;
 if (select balance from public.countries where id=v_buyer)<v_total then raise exception 'Niewystarczające środki'; end if;
 update public.countries set balance=balance-v_total where id=v_buyer;
 execute format('update public.countries set %I=%I+$1 where id=$2',v_offer.resource,v_offer.resource) using p_quantity,v_buyer;
 update public.countries set balance=balance+v_total where id=v_offer.seller_country_id;
 v_remaining_qty:=v_offer.quantity_remaining-p_quantity;
 v_remaining_total:=v_offer.total_price_remaining-v_total;
 update public.market_offers set quantity_remaining=v_remaining_qty,total_price_remaining=v_remaining_total,
   unit_price=case when v_remaining_qty>0 then greatest(1,ceil(v_remaining_total/v_remaining_qty)) else unit_price end,
   status=case when v_remaining_qty=0 then 'SOLD' else 'ACTIVE' end where id=p_offer_id;
 if v_remaining_qty=0 then update public.market_negotiations set status='CANCELLED',updated_at=now() where offer_id=p_offer_id and status='PENDING'; end if;
 insert into public.market_sales(offer_id,seller_country_id,buyer_country_id,resource,quantity,unit_price,total_price)
 values(p_offer_id,v_offer.seller_country_id,v_buyer,v_offer.resource,p_quantity,greatest(1,ceil(v_total/p_quantity)),v_total);
 insert into public.transactions(country_id,kind,label,amount_kr,actor_id,details) values
 (v_buyer,'MARKET_BUY','Zakup na rynku: '||v_offer.resource,-v_total,auth.uid(),jsonb_build_object('offer_id',p_offer_id,'quantity',p_quantity,'total_price',v_total,'seller_country_id',v_offer.seller_country_id)),
 (v_offer.seller_country_id,'MARKET_SELL','Sprzedaż na rynku: '||v_offer.resource,v_total,auth.uid(),jsonb_build_object('offer_id',p_offer_id,'quantity',p_quantity,'total_price',v_total,'buyer_country_id',v_buyer));
 return jsonb_build_object('ok',true,'quantity',p_quantity,'total',v_total);
end $$;


-- Negotiations and counteroffers must also cover the complete remaining lot.
create or replace function public.market_propose_total(p_offer_id uuid,p_quantity numeric,p_total_price numeric)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_offer public.market_offers; v_buyer uuid:=public.my_country_id(); v_id uuid;
begin
 if v_buyer is null or auth.uid() is null then raise exception 'Brak przypisanego państwa'; end if;
 if p_quantity is null or p_quantity<1 or scale(p_quantity)>0 or p_total_price is null or p_total_price<p_quantity or scale(p_total_price)>0 then raise exception 'Nieprawidłowa ilość lub łączna kwota'; end if;
 select * into v_offer from public.market_offers where id=p_offer_id for update;
 if not found or v_offer.status<>'ACTIVE' or v_offer.expires_at<=now() then raise exception 'Oferta jest niedostępna'; end if;
 if v_offer.seller_country_id=v_buyer then raise exception 'Nie możesz negocjować własnej oferty'; end if;
 if p_quantity<>v_offer.quantity_remaining then raise exception 'Negocjacja musi obejmować całą pozostałą ilość oferty'; end if;
 insert into public.market_negotiations(offer_id,buyer_country_id,quantity,unit_price,total_price,last_offer_by,expires_at)
 values(p_offer_id,v_buyer,p_quantity,greatest(1,ceil(p_total_price/p_quantity)),p_total_price,'BUYER',least(now()+interval '7 days',v_offer.expires_at)) returning id into v_id;
 return v_id;
end $$;

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
   if p_quantity is null or p_quantity<1 or scale(p_quantity)>0 or p_quantity<>o.quantity_remaining or p_total_price is null or p_total_price<p_quantity or scale(p_total_price)>0 then raise exception 'Kontroferta musi obejmować całą pozostałą ilość oferty'; end if;
   update public.market_negotiations set quantity=p_quantity,unit_price=greatest(1,ceil(p_total_price/p_quantity)),total_price=p_total_price,last_offer_by=case when v_actor=o.seller_country_id then 'SELLER' else 'BUYER' end,updated_at=now() where id=n.id;
   return jsonb_build_object('ok',true);
 elsif p_action='ACCEPT' then
   if v_actor<>o.seller_country_id or n.last_offer_by<>'BUYER' then raise exception 'Nie możesz teraz zaakceptować tej propozycji'; end if;
 elsif p_action='ACCEPT_COUNTER' then
   if v_actor<>n.buyer_country_id or n.last_offer_by<>'SELLER' then raise exception 'Nie możesz teraz zaakceptować tej kontroferty'; end if;
 else raise exception 'Nieznana operacja'; end if;
 if n.quantity<>o.quantity_remaining then raise exception 'Negocjacja musi obejmować całą pozostałą ilość oferty'; end if;
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

notify pgrst,'reload schema';
