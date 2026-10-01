-- 0041: country-to-country military transfers and region-to-region AA transfers.
create or replace function public.transfer_military(
  p_from_country_id uuid, p_to_country_id uuid, p_resource text, p_amount integer,
  p_from_region_id uuid default null, p_to_region_id uuid default null
) returns jsonb language plpgsql security definer set search_path = public as $function$
declare
  v_from public.countries; v_to public.countries; v_from_region public.regions; v_to_region public.regions;
  v_from_name text; v_to_name text; v_lock_first uuid; v_lock_second uuid; v_available integer;
begin
  if auth.uid() is null then raise exception 'Brak autoryzacji'; end if;
  if p_amount is null or p_amount < 1 then raise exception 'Podaj dodatnią ilość'; end if;
  if p_from_country_id is null or p_to_country_id is null or p_from_country_id = p_to_country_id then raise exception 'Nieprawidłowe państwo nadawcy lub odbiorcy'; end if;
  if p_resource not in ('soldier_packs','tank_packs','missile_1','missile_2','missile_3','aa_defense') then raise exception 'Ta jednostka nie może być obecnie przesyłana'; end if;
  perform public.assert_can_manage(p_from_country_id);
  v_lock_first := least(p_from_country_id, p_to_country_id); v_lock_second := greatest(p_from_country_id, p_to_country_id);
  perform 1 from public.countries where id = v_lock_first for update; perform 1 from public.countries where id = v_lock_second for update;
  select * into v_from from public.countries where id = p_from_country_id; select * into v_to from public.countries where id = p_to_country_id;
  if v_from.id is null or v_to.id is null then raise exception 'Nie znaleziono państwa'; end if;
  if p_resource = 'aa_defense' then
    if p_from_region_id is null or p_to_region_id is null then raise exception 'Dla OPL wybierz oba regiony'; end if;
    if p_from_region_id = p_to_region_id then raise exception 'Region źródłowy i docelowy muszą być różne'; end if;
    select * into v_from_region from public.regions where id = p_from_region_id for update; select * into v_to_region from public.regions where id = p_to_region_id for update;
    if v_from_region.id is null or v_to_region.id is null then raise exception 'Nie znaleziono regionu'; end if;
    if v_from_region.country_id <> p_from_country_id then raise exception 'Region źródłowy nie należy do Twojego państwa'; end if;
    if v_to_region.country_id <> p_to_country_id then raise exception 'Region docelowy nie należy do wybranego państwa'; end if;
    if v_from_region.aa_defense < p_amount then raise exception 'Brak wystarczającej ilości OPL w regionie źródłowym'; end if;
    update public.regions set aa_defense = aa_defense - p_amount where id = p_from_region_id; update public.regions set aa_defense = aa_defense + p_amount where id = p_to_region_id;
  else
    v_available := case p_resource when 'soldier_packs' then v_from.soldier_packs when 'tank_packs' then v_from.tank_packs when 'missile_1' then v_from.missile_1 when 'missile_2' then v_from.missile_2 when 'missile_3' then v_from.missile_3 else 0 end;
    if v_available < p_amount then raise exception 'Brak wystarczającej ilości jednostek'; end if;
    execute format('update public.countries set %I = %I - $1 where id = $2', p_resource, p_resource) using p_amount, p_from_country_id;
    execute format('update public.countries set %I = %I + $1 where id = $2', p_resource, p_resource) using p_amount, p_to_country_id;
  end if;
  select name into v_from_name from public.countries where id = p_from_country_id; select name into v_to_name from public.countries where id = p_to_country_id;
  insert into public.transactions(country_id,kind,label,amount_kr,actor_id,details) values(p_from_country_id,'TRANSFER','Transfer wojskowy: '||p_resource||' → '||v_to_name,0,auth.uid(),jsonb_build_object('direction','out','resource',p_resource,'amount',p_amount,'to_country_id',p_to_country_id,'from_region_id',p_from_region_id,'to_region_id',p_to_region_id));
  insert into public.transactions(country_id,kind,label,amount_kr,actor_id,details) values(p_to_country_id,'TRANSFER','Transfer wojskowy: '||p_resource||' ← '||v_from_name,0,auth.uid(),jsonb_build_object('direction','in','resource',p_resource,'amount',p_amount,'from_country_id',p_from_country_id,'from_region_id',p_from_region_id,'to_region_id',p_to_region_id));
  return jsonb_build_object('ok',true,'resource',p_resource,'amount',p_amount);
end;
$function$;
revoke execute on function public.transfer_military(uuid,uuid,text,integer,uuid,uuid) from public;
grant execute on function public.transfer_military(uuid,uuid,text,integer,uuid,uuid) to authenticated, service_role;
notify pgrst, 'reload schema';
