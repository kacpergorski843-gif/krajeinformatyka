-- UPDATE 4.0 completion: full resource transfers, durable occupation history, strict admin grants.
create table if not exists public.region_occupations (
  id uuid primary key default gen_random_uuid(),
  region_id uuid not null references public.regions(id) on delete cascade,
  previous_country_id uuid not null references public.countries(id),
  current_country_id uuid not null references public.countries(id),
  occupied_at timestamptz not null default now(),
  actor_id uuid not null references auth.users(id)
);

create index if not exists region_occupations_region_idx on public.region_occupations(region_id, occupied_at desc);
create index if not exists region_occupations_previous_idx on public.region_occupations(previous_country_id, occupied_at desc);
create index if not exists region_occupations_current_idx on public.region_occupations(current_country_id, occupied_at desc);

alter table public.region_occupations enable row level security;
drop policy if exists region_occupations_authenticated_read on public.region_occupations;
create policy region_occupations_authenticated_read
  on public.region_occupations for select to authenticated using (true);

create or replace function public.transfer_resource(
  p_from_country_id uuid,
  p_to_country_id uuid,
  p_resource text,
  p_amount numeric
)
returns jsonb language plpgsql security definer set search_path=public as $function$
declare
  v_from public.countries;
  v_to public.countries;
  v_from_name text;
  v_to_name text;
  v_lock_first uuid;
  v_lock_second uuid;
  v_from_balance numeric;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'Podaj dodatnią ilość'; end if;
  if p_from_country_id = p_to_country_id then raise exception 'Nie możesz wysłać zasobu do własnego państwa'; end if;
  if p_resource not in ('balance','coal','oil','copper','iron','uranium','aa_defense','soldier_packs','tank_packs','missile_1','missile_2','missile_3') then
    raise exception 'Ten zasób nie może być obecnie przesyłany';
  end if;
  perform public.assert_can_manage(p_from_country_id);
  v_lock_first := least(p_from_country_id, p_to_country_id);
  v_lock_second := greatest(p_from_country_id, p_to_country_id);
  perform 1 from public.countries where id=v_lock_first for update;
  perform 1 from public.countries where id=v_lock_second for update;
  select * into v_from from public.countries where id=p_from_country_id;
  select * into v_to from public.countries where id=p_to_country_id;
  if v_from.id is null or v_to.id is null then raise exception 'Nie znaleziono państwa'; end if;

  v_from_balance := case p_resource
    when 'balance' then v_from.balance
    when 'coal' then v_from.coal
    when 'oil' then v_from.oil
    when 'copper' then v_from.copper
    when 'iron' then v_from.iron
    when 'uranium' then v_from.uranium
    when 'aa_defense' then v_from.aa_defense
    when 'soldier_packs' then v_from.soldier_packs
    when 'tank_packs' then v_from.tank_packs
    when 'missile_1' then v_from.missile_1
    when 'missile_2' then v_from.missile_2
    when 'missile_3' then v_from.missile_3
    else 0
  end;
  if v_from_balance < p_amount then raise exception 'Brak wystarczającej ilości zasobu'; end if;

  execute format('update public.countries set %I=%I-$1 where id=$2',p_resource,p_resource) using p_amount,p_from_country_id;
  execute format('update public.countries set %I=%I+$1 where id=$2',p_resource,p_resource) using p_amount,p_to_country_id;

  select name into v_from_name from public.countries where id=p_from_country_id;
  select name into v_to_name from public.countries where id=p_to_country_id;

  insert into public.transactions(country_id,kind,label,amount_kr,actor_id,details)
  values(p_from_country_id,'TRANSFER','Transfer: '||p_resource||' → '||v_to_name,case when p_resource='balance' then -p_amount else 0 end,auth.uid(),
    jsonb_build_object('direction','out','resource',p_resource,'amount',p_amount,'to_country_id',p_to_country_id));
  insert into public.transactions(country_id,kind,label,amount_kr,actor_id,details)
  values(p_to_country_id,'TRANSFER','Transfer: '||p_resource||' ← '||v_from_name,case when p_resource='balance' then p_amount else 0 end,auth.uid(),
    jsonb_build_object('direction','in','resource',p_resource,'amount',p_amount,'from_country_id',p_from_country_id));
  return jsonb_build_object('ok',true,'resource',p_resource,'amount',p_amount);
end;
$function$;

create or replace function public.admin_grant_building(
  p_country_id uuid,p_region_id uuid,p_slot_index smallint,p_building text,p_quantity integer default 1
) returns jsonb language plpgsql security definer set search_path=public as $function$
declare v_role text; v_item public.shop_items; v_i int; v_slot smallint;
begin
  select role::text into v_role from public.user_roles where user_id=auth.uid() and role in ('ADMIN','MAIN_ADMIN') order by role desc limit 1;
  if v_role is null then raise exception 'Brak uprawnień administratora'; end if;
  if p_quantity < 1 or p_quantity > 9 then raise exception 'Nieprawidłowa ilość'; end if;
  if p_slot_index < 1 or p_slot_index + p_quantity - 1 > 9 then raise exception 'Budynki muszą mieścić się w slotach 1–9'; end if;
  if not exists(select 1 from public.regions where id=p_region_id and country_id=p_country_id) then raise exception 'Region nie należy do państwa'; end if;
  select * into v_item from public.shop_items where building=p_building::building_type and active limit 1;
  if v_item.building is null then raise exception 'Nie znaleziono budynku'; end if;
  for v_i in 0..p_quantity-1 loop
    v_slot:=p_slot_index+v_i;
    insert into public.region_slots(region_id,slot_index,building) values(p_region_id,v_slot,p_building::building_type)
    on conflict(region_id,slot_index) do update set building=excluded.building;
  end loop;
  insert into public.admin_actions(action,country_id,details,actor_id)
  values('GRANT_BUILDING',p_country_id,jsonb_build_object('region_id',p_region_id,'slot',p_slot_index,'building',p_building,'quantity',p_quantity,'bypass_requirements',true),auth.uid());
  return jsonb_build_object('ok',true,'quantity',p_quantity);
end;
$function$;

create or replace function public.admin_occupy_region(p_region_id uuid,p_new_country_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $function$
declare v_role text; v_old uuid; v_name text;
begin
  select role::text into v_role from public.user_roles where user_id=auth.uid() and role in ('ADMIN','MAIN_ADMIN') order by role desc limit 1;
  if v_role is null then raise exception 'Brak uprawnień administratora'; end if;
  select country_id into v_old from public.regions where id=p_region_id for update;
  if v_old is null then raise exception 'Nie znaleziono regionu'; end if;
  if v_old=p_new_country_id then raise exception 'Region już należy do tego państwa'; end if;
  if not exists(select 1 from public.countries where id=p_new_country_id) then raise exception 'Nie znaleziono kraju przejmującego'; end if;
  select name into v_name from public.regions where id=p_region_id;
  update public.regions set country_id=p_new_country_id where id=p_region_id;
  insert into public.region_occupations(region_id,previous_country_id,current_country_id,occupied_at,actor_id)
  values(p_region_id,v_old,p_new_country_id,now(),auth.uid());
  insert into public.admin_actions(action,country_id,details,actor_id)
  values('OCCUPY_REGION',p_new_country_id,jsonb_build_object('region_id',p_region_id,'region_name',v_name,'previous_country_id',v_old,'new_country_id',p_new_country_id,'occupied_at',now()),auth.uid());
  return jsonb_build_object('ok',true,'region_id',p_region_id,'region_name',v_name,'previous_country_id',v_old,'new_country_id',p_new_country_id);
end;
$function$;

grant execute on function public.transfer_resource(uuid,uuid,text,numeric) to authenticated;
grant execute on function public.admin_grant_building(uuid,uuid,smallint,text,integer) to authenticated;
grant execute on function public.admin_occupy_region(uuid,uuid) to authenticated;