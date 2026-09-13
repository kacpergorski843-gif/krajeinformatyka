-- STATS VIEW ----------------------------------------------------------
create or replace view public.country_stats
with (security_invoker = on) as
select
  c.id as country_id,
  c.name,
  c.flag,
  c.balance,
  c.coal, c.oil, c.copper, c.iron, c.uranium,
  c.aa_defense, c.missile_1, c.missile_2, c.missile_3,
  c.soldier_packs, c.tank_packs,
  least(c.soldier_packs,6) + least(c.tank_packs,4) as war_votes,
  coalesce(b.regions_count,0) as regions_count,
  coalesce(b.gross_income,0)::numeric(30,0) as gross_income,
  coalesce(b.coal_upkeep,0)::numeric(30,0) as coal_upkeep,
  coalesce(b.coal_prod,0)::numeric(30,0) as coal_prod,
  coalesce(b.oil_prod,0)::numeric(30,0) as oil_prod,
  coalesce(b.copper_prod,0)::numeric(30,0) as copper_prod,
  coalesce(b.iron_prod,0)::numeric(30,0) as iron_prod,
  coalesce(b.uranium_prod,0)::numeric(30,0) as uranium_prod,
  coalesce(b.forts,0) as forts,
  (c.aa_defense::numeric * 1000000000
   + c.missile_1::numeric * 2000000000
   + c.missile_2::numeric * 5000000000
   + c.missile_3::numeric * 12000000000
   + c.soldier_packs::numeric * 20000000000
   + c.tank_packs::numeric * 30000000000
   + coalesce(b.forts,0)::numeric * 40000000000)::numeric(30,0) as military_value
from public.countries c
left join (
  select r.country_id,
    count(distinct r.id) as regions_count,
    sum(case s.building
      when 'factory_1' then 20000000000 when 'factory_2' then 50000000000
      when 'factory_3' then 80000000000 when 'factory_4' then 150000000000
      when 'factory_5' then 250000000000 else 0 end) as gross_income,
    sum(case s.building when 'factory_4' then 50 when 'factory_5' then 100 else 0 end) as coal_upkeep,
    sum(case when s.building = 'mine_coal' then 100 else 0 end) as coal_prod,
    sum(case when s.building = 'mine_oil' then 100 else 0 end) as oil_prod,
    sum(case when s.building = 'mine_copper' then 100 else 0 end) as copper_prod,
    sum(case when s.building = 'mine_iron' then 100 else 0 end) as iron_prod,
    sum(case when s.building = 'mine_uranium' then 25 else 0 end) as uranium_prod,
    count(s.id) filter (where s.building in ('fort_1','fort_2','fort_3')) as forts
  from public.regions r
  left join public.region_slots s on s.region_id = r.id
  group by r.country_id
) b on b.country_id = c.id;

grant select on public.country_stats to authenticated;

-- GUARD ---------------------------------------------------------------
create or replace function public.assert_can_manage(p_country_id uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Brak autoryzacji'; end if;
  if public.is_admin(auth.uid()) then return; end if;
  if p_country_id is null or p_country_id <> public.my_country_id() then
    raise exception 'Możesz zarządzać wyłącznie swoim państwem';
  end if;
end;
$$;

create or replace function public.charge_country(p_country_id uuid, p_item public.shop_items, p_qty integer)
returns void language plpgsql security definer set search_path = public as $$
declare c public.countries;
begin
  select * into c from public.countries where id = p_country_id for update;
  if c.id is null then raise exception 'Nie znaleziono państwa'; end if;
  if c.balance < p_item.cost_kr * p_qty then raise exception 'Za mało KR w skarbcu'; end if;
  if c.coal < p_item.cost_coal * p_qty then raise exception 'Za mało węgla'; end if;
  if c.oil < p_item.cost_oil * p_qty then raise exception 'Za mało ropy'; end if;
  if c.copper < p_item.cost_copper * p_qty then raise exception 'Za mało miedzi'; end if;
  if c.iron < p_item.cost_iron * p_qty then raise exception 'Za mało żelaza'; end if;
  if c.uranium < p_item.cost_uranium * p_qty then raise exception 'Za mało uranu'; end if;
  update public.countries set
    balance = balance - p_item.cost_kr * p_qty,
    coal = coal - p_item.cost_coal * p_qty,
    oil = oil - p_item.cost_oil * p_qty,
    copper = copper - p_item.cost_copper * p_qty,
    iron = iron - p_item.cost_iron * p_qty,
    uranium = uranium - p_item.cost_uranium * p_qty
  where id = p_country_id;
end;
$$;

-- BUILD IN SLOT -------------------------------------------------------
create or replace function public.build_in_slot(p_region_id uuid, p_slot_index smallint, p_item_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_country uuid; v_item public.shop_items; v_used int; v_mine text; v_mine_count int; v_fort int;
begin
  select country_id into v_country from public.regions where id = p_region_id;
  if v_country is null then raise exception 'Nie znaleziono regionu'; end if;
  perform public.assert_can_manage(v_country);

  select * into v_item from public.shop_items where code = p_item_code and active;
  if v_item.code is null or v_item.building is null then
    raise exception 'Ten produkt nie jest budynkiem regionalnym';
  end if;
  if p_slot_index < 1 or p_slot_index > 9 then raise exception 'Nieprawidłowy slot'; end if;

  perform 1 from public.regions where id = p_region_id for update;

  if exists (select 1 from public.region_slots where region_id = p_region_id and slot_index = p_slot_index) then
    raise exception 'Ten slot jest już zajęty';
  end if;
  select count(*) into v_used from public.region_slots where region_id = p_region_id;
  if v_used >= 9 then raise exception 'Region nie ma wolnych slotów'; end if;

  if v_item.building::text like 'mine_%' then
    select s.building::text into v_mine from public.region_slots s
      where s.region_id = p_region_id and s.building::text like 'mine_%' limit 1;
    if v_mine is not null and v_mine <> v_item.building::text then
      raise exception 'W regionie mogą stać wytwórnie tylko jednego surowca';
    end if;
    select count(*) into v_mine_count from public.region_slots
      where region_id = p_region_id and building = v_item.building;
    if v_mine_count >= 3 then raise exception 'Maksymalnie 3 wytwórnie tego surowca w regionie'; end if;
  end if;

  if v_item.building in ('fort_1','fort_2','fort_3') then
    select count(*) into v_fort from public.region_slots
      where region_id = p_region_id and building in ('fort_1','fort_2','fort_3');
    if v_fort >= 1 then raise exception 'W regionie może stać tylko jedna fortyfikacja'; end if;
  end if;

  perform public.charge_country(v_country, v_item, 1);
  insert into public.region_slots (region_id, slot_index, building)
  values (p_region_id, p_slot_index, v_item.building);

  insert into public.transactions (country_id, kind, label, amount_kr, actor_id, details)
  values (v_country, 'BUILD', 'Budowa: ' || v_item.name, -v_item.cost_kr, auth.uid(),
          jsonb_build_object('region_id', p_region_id, 'slot', p_slot_index, 'item', v_item.code));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.demolish_slot(p_slot_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_country uuid; v_building public.building_type;
begin
  select r.country_id, s.building into v_country, v_building
  from public.region_slots s join public.regions r on r.id = s.region_id where s.id = p_slot_id;
  if v_country is null then raise exception 'Nie znaleziono obiektu'; end if;
  perform public.assert_can_manage(v_country);
  delete from public.region_slots where id = p_slot_id;
  insert into public.transactions (country_id, kind, label, amount_kr, actor_id, details)
  values (v_country, 'DEMOLISH', 'Rozbiórka: ' || v_building::text, 0, auth.uid(),
          jsonb_build_object('slot_id', p_slot_id));
  return jsonb_build_object('ok', true);
end;
$$;

-- PURCHASE UNITS ------------------------------------------------------
create or replace function public.purchase_unit(p_country_id uuid, p_item_code text, p_qty integer default 1)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_item public.shop_items; c public.countries;
begin
  if p_qty is null or p_qty < 1 or p_qty > 100 then raise exception 'Nieprawidłowa ilość'; end if;
  perform public.assert_can_manage(p_country_id);
  select * into v_item from public.shop_items where code = p_item_code and active;
  if v_item.code is null then raise exception 'Nie znaleziono produktu'; end if;
  if v_item.building is not null then raise exception 'Ten obiekt buduje się w regionie'; end if;

  select * into c from public.countries where id = p_country_id;
  if p_item_code = 'soldiers' and c.soldier_packs + p_qty > 6 then
    raise exception 'Maksymalnie 6 pakietów żołnierzy';
  end if;
  if p_item_code = 'tanks' and c.tank_packs + p_qty > 4 then
    raise exception 'Maksymalnie 4 pakiety czołgów';
  end if;

  perform public.charge_country(p_country_id, v_item, p_qty);

  update public.countries set
    aa_defense = aa_defense + case when p_item_code = 'aa' then p_qty else 0 end,
    missile_1 = missile_1 + case when p_item_code = 'missile_1' then p_qty else 0 end,
    missile_2 = missile_2 + case when p_item_code = 'missile_2' then p_qty else 0 end,
    missile_3 = missile_3 + case when p_item_code = 'missile_3' then p_qty else 0 end,
    soldier_packs = soldier_packs + case when p_item_code = 'soldiers' then p_qty else 0 end,
    tank_packs = tank_packs + case when p_item_code = 'tanks' then p_qty else 0 end
  where id = p_country_id;

  insert into public.transactions (country_id, kind, label, amount_kr, actor_id, details)
  values (p_country_id, 'PURCHASE', 'Zakup: ' || v_item.name || ' x' || p_qty,
          -(v_item.cost_kr * p_qty), auth.uid(), jsonb_build_object('item', v_item.code, 'qty', p_qty));
  return jsonb_build_object('ok', true);
end;
$$;

-- DAILY ECONOMY -------------------------------------------------------
create or replace function public.run_daily_economy(p_run_date date default (now() at time zone 'Europe/Warsaw')::date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r record; v_income numeric; v_coal numeric; v_upkeep numeric; v_processed int := 0; v_total numeric := 0;
begin
  if auth.uid() is not null and not public.is_admin(auth.uid()) then
    raise exception 'Tylko administrator może uruchomić cykl dobowy';
  end if;
  insert into public.economy_runs (run_date, triggered_by) values (p_run_date, auth.uid())
  on conflict (run_date) do nothing;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'already_run', 'run_date', p_run_date);
  end if;

  for r in select * from public.country_stats loop
    v_coal := r.coal + r.coal_prod;
    v_upkeep := r.coal_upkeep;
    v_income := r.gross_income;
    if v_upkeep > 0 and v_coal < v_upkeep then
      -- brak węgla: fabryki IV/V nie produkują i nie zużywają węgla
      v_income := v_income - (
        select coalesce(sum(case s.building when 'factory_4' then 150000000000
                                            when 'factory_5' then 250000000000 else 0 end),0)
        from public.region_slots s join public.regions g on g.id = s.region_id
        where g.country_id = r.country_id and s.building in ('factory_4','factory_5'));
      v_upkeep := 0;
    end if;

    update public.countries set
      balance = balance + v_income,
      coal = coal + r.coal_prod - v_upkeep,
      oil = oil + r.oil_prod,
      copper = copper + r.copper_prod,
      iron = iron + r.iron_prod,
      uranium = uranium + r.uranium_prod
    where id = r.country_id;

    insert into public.transactions (country_id, kind, label, amount_kr, details)
    values (r.country_id, 'ECONOMY', 'Cykl dobowy ' || p_run_date, v_income,
      jsonb_build_object('coal_prod', r.coal_prod, 'coal_upkeep', v_upkeep, 'oil', r.oil_prod,
                         'copper', r.copper_prod, 'iron', r.iron_prod, 'uranium', r.uranium_prod));
    v_processed := v_processed + 1;
    v_total := v_total + v_income;
  end loop;

  update public.economy_runs set summary = jsonb_build_object('countries', v_processed, 'total_kr', v_total)
  where run_date = p_run_date;
  return jsonb_build_object('ok', true, 'countries', v_processed, 'total_kr', v_total);
end;
$$;

-- ADMIN ---------------------------------------------------------------
create or replace function public.admin_adjust_country(p_country_id uuid, p_patch jsonb, p_note text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'Brak uprawnień administratora'; end if;
  update public.countries set
    name = coalesce(p_patch->>'name', name),
    flag = coalesce(p_patch->>'flag', flag),
    balance = coalesce((p_patch->>'balance')::numeric, balance),
    coal = coalesce((p_patch->>'coal')::numeric, coal),
    oil = coalesce((p_patch->>'oil')::numeric, oil),
    copper = coalesce((p_patch->>'copper')::numeric, copper),
    iron = coalesce((p_patch->>'iron')::numeric, iron),
    uranium = coalesce((p_patch->>'uranium')::numeric, uranium),
    aa_defense = coalesce((p_patch->>'aa_defense')::int, aa_defense),
    missile_1 = coalesce((p_patch->>'missile_1')::int, missile_1),
    missile_2 = coalesce((p_patch->>'missile_2')::int, missile_2),
    missile_3 = coalesce((p_patch->>'missile_3')::int, missile_3),
    soldier_packs = coalesce((p_patch->>'soldier_packs')::int, soldier_packs),
    tank_packs = coalesce((p_patch->>'tank_packs')::int, tank_packs)
  where id = p_country_id;
  insert into public.admin_actions (actor_id, country_id, action, details)
  values (auth.uid(), p_country_id, 'ADJUST_COUNTRY', jsonb_build_object('patch', p_patch, 'note', p_note));
  insert into public.transactions (country_id, kind, label, amount_kr, actor_id, details)
  values (p_country_id, 'ADMIN', 'Korekta administracyjna', 0, auth.uid(), p_patch);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_create_country(p_name text, p_flag text default '🏳️')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_admin(auth.uid()) then raise exception 'Brak uprawnień administratora'; end if;
  insert into public.countries (name, flag) values (p_name, coalesce(nullif(p_flag,''),'🏳️')) returning id into v_id;
  insert into public.admin_actions (actor_id, country_id, action, details)
  values (auth.uid(), v_id, 'CREATE_COUNTRY', jsonb_build_object('name', p_name));
  return v_id;
end;
$$;

create or replace function public.admin_create_region(p_country_id uuid, p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_admin(auth.uid()) then raise exception 'Brak uprawnień administratora'; end if;
  insert into public.regions (country_id, name) values (p_country_id, p_name) returning id into v_id;
  insert into public.admin_actions (actor_id, country_id, action, details)
  values (auth.uid(), p_country_id, 'CREATE_REGION', jsonb_build_object('name', p_name));
  return v_id;
end;
$$;

create or replace function public.admin_delete_region(p_region_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_country uuid;
begin
  if not public.is_admin(auth.uid()) then raise exception 'Brak uprawnień administratora'; end if;
  select country_id into v_country from public.regions where id = p_region_id;
  delete from public.regions where id = p_region_id;
  insert into public.admin_actions (actor_id, country_id, action, details)
  values (auth.uid(), v_country, 'DELETE_REGION', jsonb_build_object('region_id', p_region_id));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_assign_country(p_user_id uuid, p_country_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'Brak uprawnień administratora'; end if;
  update public.profiles set country_id = p_country_id where id = p_user_id;
  insert into public.admin_actions (actor_id, country_id, action, details)
  values (auth.uid(), p_country_id, 'ASSIGN_COUNTRY', jsonb_build_object('user_id', p_user_id));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.set_user_role(p_user_id uuid, p_role public.app_role)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'MAIN_ADMIN') then
    raise exception 'Tylko główny administrator może zmieniać uprawnienia';
  end if;
  if p_user_id = auth.uid() then raise exception 'Nie możesz zmienić własnych uprawnień'; end if;
  delete from public.user_roles where user_id = p_user_id;
  insert into public.user_roles (user_id, role) values (p_user_id, p_role);
  insert into public.admin_actions (actor_id, action, details)
  values (auth.uid(), 'SET_ROLE', jsonb_build_object('user_id', p_user_id, 'role', p_role));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_list_users()
returns table (id uuid, email text, display_name text, country_id uuid, country_name text, role public.app_role)
language sql stable security definer set search_path = public as $$
  select p.id, p.email, p.display_name, p.country_id, c.name,
         (select ur.role from public.user_roles ur where ur.user_id = p.id order by ur.role desc limit 1)
  from public.profiles p
  left join public.countries c on c.id = p.country_id
  where public.is_admin(auth.uid())
  order by p.created_at;
$$;

create or replace function public.claim_main_admin()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Brak autoryzacji'; end if;
  if exists (select 1 from public.user_roles where role = 'MAIN_ADMIN') then
    raise exception 'Główny administrator już istnieje';
  end if;
  delete from public.user_roles where user_id = auth.uid();
  insert into public.user_roles (user_id, role) values (auth.uid(), 'MAIN_ADMIN');
  return jsonb_build_object('ok', true);
end;
$$;
