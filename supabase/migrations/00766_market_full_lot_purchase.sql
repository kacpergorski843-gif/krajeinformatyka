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

notify pgrst,'reload schema';
