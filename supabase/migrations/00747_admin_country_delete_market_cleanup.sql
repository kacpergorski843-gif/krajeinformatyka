-- 00747: delete market rows before deleting a country. Market sales and
-- negotiations intentionally retain restrictive foreign keys so historical
-- records cannot disappear accidentally; the explicit admin delete path must
-- remove those records deliberately before deleting the country.
create or replace function public.admin_delete_country(p_country_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_country public.countries;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Brak uprawnień administratora';
  end if;

  select * into v_country
  from public.countries
  where id = p_country_id
  for update;

  if v_country.id is null then
    raise exception 'Nie znaleziono państwa';
  end if;

  insert into public.admin_actions (actor_id, country_id, action, details)
  values (
    auth.uid(),
    null,
    'DELETE_COUNTRY',
    jsonb_build_object(
      'country_id', p_country_id,
      'name', v_country.name,
      'balance', v_country.balance
    )
  );

  -- Market tables have restrictive references to sales participants and offers.
  delete from public.market_negotiations n
  where n.buyer_country_id = p_country_id
     or n.offer_id in (
       select o.id from public.market_offers o
       where o.seller_country_id = p_country_id
     );

  delete from public.market_sales s
  where s.seller_country_id = p_country_id
     or s.buyer_country_id = p_country_id
     or s.offer_id in (
       select o.id from public.market_offers o
       where o.seller_country_id = p_country_id
     );

  delete from public.market_offers
  where seller_country_id = p_country_id;

  -- Agreements cascade through their country foreign keys. Remove game
  -- objects and ledger rows using the same cleanup policy as the original RPC.
  delete from public.region_slots s
  where s.region_id in (
    select r.id from public.regions r where r.country_id = p_country_id
  );

  delete from public.regions
  where country_id = p_country_id;

  delete from public.transactions
  where country_id = p_country_id;

  delete from public.missile_strikes
  where attacker_country_id = p_country_id
     or defender_country_id = p_country_id;

  update public.admin_actions
  set country_id = null
  where country_id = p_country_id;

  update public.profiles
  set country_id = null
  where country_id = p_country_id;

  delete from public.countries
  where id = p_country_id;

  return jsonb_build_object('ok', true);
end;
$function$;

revoke all on function public.admin_delete_country(uuid) from public, anon;
grant execute on function public.admin_delete_country(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
