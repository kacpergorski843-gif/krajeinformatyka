-- UPDATE 3.5: jedno źródło prawdy dla OPL, brak limitów wojska, usuwanie państw i graczy

update public.countries c
set aa_defense = coalesce((select sum(r.aa_defense) from public.regions r where r.country_id = c.id), 0);

create or replace function public.sync_country_aa(p_country_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.countries c
  set aa_defense = coalesce((select sum(r.aa_defense) from public.regions r where r.country_id = c.id), 0)
  where c.id = p_country_id;
end;
$$;

create or replace function public.tg_sync_country_aa()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform public.sync_country_aa(old.country_id);
    return old;
  end if;
  perform public.sync_country_aa(new.country_id);
  if tg_op = 'UPDATE' and old.country_id <> new.country_id then
    perform public.sync_country_aa(old.country_id);
  end if;
  return new;
end;
$$;

drop trigger if exists regions_sync_country_aa on public.regions;
create trigger regions_sync_country_aa
after insert or update or delete on public.regions
for each row execute function public.tg_sync_country_aa();

create or replace function public.admin_set_region_aa(p_region_id uuid, p_value integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_region public.regions;
begin
  if not public.is_admin(auth.uid()) then raise exception 'Brak uprawnień administratora'; end if;
  if p_value is null or p_value < 0 then raise exception 'Nieprawidłowa wartość OPL'; end if;
  select * into v_region from public.regions where id = p_region_id for update;
  if v_region.id is null then raise exception 'Nie znaleziono regionu'; end if;
  update public.regions set aa_defense = p_value where id = p_region_id;
  insert into public.admin_actions (actor_id, country_id, action, details)
  values (auth.uid(), v_region.country_id, 'REGION_AA',
          jsonb_build_object('region_id', p_region_id, 'region', v_region.name, 'from', v_region.aa_defense, 'to', p_value));
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.admin_set_region_aa(uuid, integer) to authenticated;

create or replace function public.admin_adjust_country(p_country_id uuid, p_patch jsonb, p_note text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_before public.countries;
begin
  if not public.is_admin(auth.uid()) then raise exception 'Brak uprawnień administratora'; end if;
  select * into v_before from public.countries where id = p_country_id;
  if v_before.id is null then raise exception 'Nie znaleziono państwa'; end if;
  update public.countries set
    name = coalesce(nullif(p_patch->>'name',''), name),
    flag = coalesce(p_patch->>'flag', flag),
    balance = coalesce((p_patch->>'balance')::numeric, balance),
    coal = coalesce((p_patch->>'coal')::numeric, coal),
    oil = coalesce((p_patch->>'oil')::numeric, oil),
    copper = coalesce((p_patch->>'copper')::numeric, copper),
    iron = coalesce((p_patch->>'iron')::numeric, iron),
    uranium = coalesce((p_patch->>'uranium')::numeric, uranium),
    missile_1 = coalesce((p_patch->>'missile_1')::int, missile_1),
    missile_2 = coalesce((p_patch->>'missile_2')::int, missile_2),
    missile_3 = coalesce((p_patch->>'missile_3')::int, missile_3),
    soldier_packs = coalesce((p_patch->>'soldier_packs')::int, soldier_packs),
    tank_packs = coalesce((p_patch->>'tank_packs')::int, tank_packs)
  where id = p_country_id;
  perform public.sync_country_aa(p_country_id);
  insert into public.admin_actions (actor_id, country_id, action, details)
  values (auth.uid(), p_country_id, 'ADJUST',
          jsonb_build_object('patch', p_patch, 'note', p_note,
            'before', jsonb_build_object('balance', v_before.balance, 'coal', v_before.coal, 'oil', v_before.oil,
              'copper', v_before.copper, 'iron', v_before.iron, 'uranium', v_before.uranium,
              'missile_1', v_before.missile_1, 'missile_2', v_before.missile_2, 'missile_3', v_before.missile_3,
              'soldier_packs', v_before.soldier_packs, 'tank_packs', v_before.tank_packs)));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_create_country(p_name text, p_flag text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_admin(auth.uid()) then raise exception 'Brak uprawnień administratora'; end if;
  if coalesce(trim(p_name),'') = '' then raise exception 'Nazwa państwa jest wymagana'; end if;
  insert into public.countries (name, flag) values (trim(p_name), coalesce(p_flag,''))
  returning id into v_id;
  insert into public.admin_actions (actor_id, country_id, action, details)
  values (auth.uid(), v_id, 'CREATE_COUNTRY', jsonb_build_object('name', trim(p_name)));
  return v_id;
end;
$$;

create or replace function public.purchase_unit(p_country_id uuid, p_item_code text, p_qty integer default 1)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_item public.shop_items;
begin
  if p_qty is null or p_qty < 1 or p_qty > 100000 then raise exception 'Nieprawidłowa ilość'; end if;
  perform public.assert_can_manage(p_country_id);
  if p_item_code = 'aa' then
    raise exception 'OPL kupuje się dla konkretnego regionu';
  end if;
  select * into v_item from public.shop_items where code = p_item_code and active;
  if v_item.code is null then raise exception 'Nie znaleziono produktu'; end if;
  if v_item.building is not null then raise exception 'Ten obiekt buduje się w regionie'; end if;

  perform public.charge_country(p_country_id, v_item, p_qty);

  update public.countries set
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
$function$;

create or replace view public.country_stats
with (security_invoker = true) as
select c.id as country_id, c.name, c.flag, c.balance, c.coal, c.oil, c.copper, c.iron, c.uranium,
  c.aa_defense, c.missile_1, c.missile_2, c.missile_3, c.soldier_packs, c.tank_packs,
  (c.soldier_packs + c.tank_packs)::int as war_votes,
  coalesce(b.regions_count,0) as regions_count,
  coalesce(b.gross_income,0::numeric)::numeric(30,0) as gross_income,
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
   + coalesce(b.forts,0)::numeric * 40000000000)::numeric(30,0) as military_value,
  coalesce(b.fort_votes,0)::int as fort_votes,
  (c.soldier_packs + c.tank_packs + coalesce(b.fort_votes,0))::int as total_votes,
  (c.soldier_packs + c.tank_packs)::int as vote_potential,
  coalesce(b.region_aa_total,0)::int as region_aa_total
from public.countries c
left join (
  select r.country_id,
    count(distinct r.id) as regions_count,
    sum(case s.building when 'factory_1' then 20000000000 when 'factory_2' then 50000000000
      when 'factory_3' then 80000000000 when 'factory_4' then 150000000000
      when 'factory_5' then 250000000000 else 0 end) as gross_income,
    sum(case s.building when 'factory_4' then 50 when 'factory_5' then 100 else 0 end) as coal_upkeep,
    sum(case when s.building = 'mine_coal' then 100 else 0 end) as coal_prod,
    sum(case when s.building = 'mine_oil' then 100 else 0 end) as oil_prod,
    sum(case when s.building = 'mine_copper' then 100 else 0 end) as copper_prod,
    sum(case when s.building = 'mine_iron' then 100 else 0 end) as iron_prod,
    sum(case when s.building = 'mine_uranium' then 25 else 0 end) as uranium_prod,
    count(s.id) filter (where s.building in ('fort_1','fort_2','fort_3')) as forts,
    sum(case s.building when 'fort_1' then 1 when 'fort_2' then 2 when 'fort_3' then 3 else 0 end) as fort_votes,
    (select sum(r2.aa_defense) from public.regions r2 where r2.country_id = r.country_id) as region_aa_total
  from public.regions r
  left join public.region_slots s on s.region_id = r.id
  group by r.country_id
) b on b.country_id = c.id;

grant select on public.country_stats to authenticated;

create or replace function public.main_admin_exists()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where role = 'MAIN_ADMIN');
$$;

grant execute on function public.main_admin_exists() to authenticated;

create or replace function public.admin_delete_country(p_country_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_country public.countries;
begin
  if not public.is_admin(auth.uid()) then raise exception 'Brak uprawnień administratora'; end if;
  select * into v_country from public.countries where id = p_country_id;
  if v_country.id is null then raise exception 'Nie znaleziono państwa'; end if;

  insert into public.admin_actions (actor_id, country_id, action, details)
  values (auth.uid(), null, 'DELETE_COUNTRY',
          jsonb_build_object('country_id', p_country_id, 'name', v_country.name, 'balance', v_country.balance));

  delete from public.region_slots s where s.region_id in (select r.id from public.regions r where r.country_id = p_country_id);
  delete from public.regions r where r.country_id = p_country_id;
  delete from public.transactions t where t.country_id = p_country_id;
  delete from public.missile_strikes m where m.attacker_country_id = p_country_id or m.defender_country_id = p_country_id;
  update public.admin_actions a set country_id = null where a.country_id = p_country_id;
  update public.profiles p set country_id = null where p.country_id = p_country_id;
  delete from public.countries c where c.id = p_country_id;
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.admin_delete_country(uuid) to authenticated;

create or replace function public.admin_purge_player(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_profile public.profiles;
begin
  if not public.is_admin(auth.uid()) then raise exception 'Brak uprawnień administratora'; end if;
  if p_user_id = auth.uid() then raise exception 'Nie można usunąć własnego konta'; end if;
  select * into v_profile from public.profiles where id = p_user_id;
  if public.has_role(p_user_id, 'MAIN_ADMIN') and not public.has_role(auth.uid(), 'MAIN_ADMIN') then
    raise exception 'Tylko główny administrator może usunąć innego administratora głównego';
  end if;

  insert into public.admin_actions (actor_id, country_id, action, details)
  values (auth.uid(), v_profile.country_id, 'DELETE_PLAYER',
          jsonb_build_object('user_id', p_user_id, 'display_name', v_profile.display_name));

  delete from public.user_roles ur where ur.user_id = p_user_id;
  delete from public.profiles p where p.id = p_user_id;
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.admin_purge_player(uuid) to authenticated;