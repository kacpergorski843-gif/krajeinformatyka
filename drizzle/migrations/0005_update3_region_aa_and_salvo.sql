-- UPDATE 3.0: OPL per region, salwy rakietowe, publiczny ranking, potencjał głosów

alter table public.regions add column if not exists aa_defense integer not null default 0;

alter table public.missile_strikes add column if not exists region_aa integer;
alter table public.missile_strikes add column if not exists required_aa integer;
alter table public.missile_strikes add column if not exists salvo_index integer;

-- Przeniesienie dotychczasowych globalnych OPL do pierwszego regionu państwa
with first_region as (
  select distinct on (r.country_id) r.id, r.country_id
  from public.regions r
  order by r.country_id, r.created_at
)
update public.regions r
set aa_defense = c.aa_defense
from first_region f
join public.countries c on c.id = f.country_id
where r.id = f.id and c.aa_defense > 0 and r.aa_defense = 0;

create or replace view public.country_stats
with (security_invoker = true) as
select c.id as country_id, c.name, c.flag, c.balance, c.coal, c.oil, c.copper, c.iron, c.uranium,
  c.aa_defense, c.missile_1, c.missile_2, c.missile_3, c.soldier_packs, c.tank_packs,
  least(c.soldier_packs,6) + least(c.tank_packs,4) as war_votes,
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
  (least(c.soldier_packs,6) + least(c.tank_packs,4) + coalesce(b.fort_votes,0))::int as total_votes,
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

-- Publiczny ranking (read-only, bez logowania)
create or replace view public.public_ranking
with (security_invoker = false) as
select c.id as country_id, c.name, c.flag,
  (c.soldier_packs + c.tank_packs)::int as vote_potential,
  c.soldier_packs, c.tank_packs,
  coalesce(x.regions_count,0)::int as regions_count,
  coalesce(x.gross_income,0::numeric)::numeric(30,0) as gross_income
from public.countries c
left join (
  select r.country_id,
    count(distinct r.id) as regions_count,
    sum(case s.building when 'factory_1' then 20000000000 when 'factory_2' then 50000000000
      when 'factory_3' then 80000000000 when 'factory_4' then 150000000000
      when 'factory_5' then 250000000000 else 0 end) as gross_income
  from public.regions r
  left join public.region_slots s on s.region_id = r.id
  group by r.country_id
) x on x.country_id = c.id;

grant select on public.public_ranking to anon, authenticated;

-- Zakup OPL przypisanego do regionu
create or replace function public.purchase_aa(p_country_id uuid, p_region_id uuid, p_qty integer default 1)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_item public.shop_items; v_region public.regions;
begin
  if p_qty is null or p_qty < 1 or p_qty > 1000 then raise exception 'Nieprawidłowa ilość'; end if;
  perform public.assert_can_manage(p_country_id);

  select * into v_region from public.regions where id = p_region_id for update;
  if v_region.id is null then raise exception 'Nie znaleziono regionu'; end if;
  if v_region.country_id <> p_country_id then raise exception 'Ten region nie należy do twojego państwa'; end if;

  select * into v_item from public.shop_items where code = 'aa' and active;
  if v_item.code is null then raise exception 'OPL nie jest dostępne w sklepie'; end if;

  perform public.charge_country(p_country_id, v_item, p_qty);

  update public.regions set aa_defense = aa_defense + p_qty where id = p_region_id;
  update public.countries set aa_defense = aa_defense + p_qty where id = p_country_id;

  insert into public.transactions (country_id, kind, label, amount_kr, actor_id, details)
  values (p_country_id, 'PURCHASE', 'Zakup: OPL x' || p_qty || ' (' || v_region.name || ')',
          -(v_item.cost_kr * p_qty), auth.uid(),
          jsonb_build_object('item','aa','qty',p_qty,'region_id',p_region_id,'region',v_region.name));
  return jsonb_build_object('ok', true);
end;
$function$;

grant execute on function public.purchase_aa(uuid, uuid, integer) to authenticated;

create or replace function public.purchase_unit(p_country_id uuid, p_item_code text, p_qty integer default 1)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_item public.shop_items; c public.countries; v_votes int;
begin
  if p_qty is null or p_qty < 1 or p_qty > 1000 then raise exception 'Nieprawidłowa ilość'; end if;
  perform public.assert_can_manage(p_country_id);
  if p_item_code = 'aa' then
    raise exception 'OPL kupuje się dla konkretnego regionu';
  end if;
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
  if p_item_code in ('soldiers','tanks') then
    v_votes := least(c.soldier_packs,6) + least(c.tank_packs,4);
    if v_votes >= 10 then
      raise exception 'Osiągnięto maksymalną liczbę 10 głosów wojennych z wojska';
    end if;
    if v_votes + p_qty > 10 then
      raise exception 'Łączny limit głosów wojennych to 10 (dostępne: %)', 10 - v_votes;
    end if;
  end if;

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

-- Rakiety: obrona liczona z OPL atakowanego regionu
create or replace function public.launch_missile(p_country_id uuid, p_missile_code text, p_region_id uuid,
  p_slot_ids uuid[] default '{}'::uuid[], p_mode text default 'factories')
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_region public.regions; v_def public.countries; v_att public.countries;
  v_needed int; v_required_aa int; v_have int; v_intercepted boolean;
  v_targets uuid[]; v_destroyed jsonb := '[]'::jsonb; v_result text; v_label text;
begin
  if p_missile_code not in ('missile_1','missile_2','missile_3') then
    raise exception 'Nieprawidłowy typ rakiety';
  end if;
  perform public.assert_can_manage(p_country_id);

  select * into v_region from public.regions where id = p_region_id for update;
  if v_region.id is null then raise exception 'Nie znaleziono regionu'; end if;
  if v_region.country_id = p_country_id then raise exception 'Nie możesz atakować własnego państwa'; end if;

  select * into v_att from public.countries where id = p_country_id for update;
  select * into v_def from public.countries where id = v_region.country_id for update;

  v_have := case p_missile_code
    when 'missile_1' then v_att.missile_1
    when 'missile_2' then v_att.missile_2
    else v_att.missile_3 end;
  if v_have < 1 then raise exception 'Nie masz tej rakiety w arsenale'; end if;

  v_required_aa := case p_missile_code when 'missile_1' then 1 when 'missile_2' then 2 else 10 end;
  v_needed := case p_missile_code when 'missile_1' then 1 when 'missile_2' then 2 else 0 end;

  if p_missile_code = 'missile_3' then
    if p_mode not in ('factories','mines') then raise exception 'Wybierz fabryki albo zakłady surowcowe'; end if;
    select coalesce(array_agg(s.id), '{}') into v_targets
    from public.region_slots s
    where s.region_id = p_region_id
      and ((p_mode = 'factories' and s.building::text like 'factory_%')
        or (p_mode = 'mines' and s.building::text like 'mine_%'));
  else
    select coalesce(array_agg(s.id), '{}') into v_targets
    from public.region_slots s
    where s.region_id = p_region_id and s.id = any(p_slot_ids);
    if array_length(v_targets, 1) is null then raise exception 'Wybierz cel w regionie'; end if;
    if array_length(v_targets, 1) > v_needed then
      raise exception 'Ta rakieta niszczy maksymalnie % obiekt(y)', v_needed;
    end if;
  end if;

  -- rakieta zużywa się zawsze
  update public.countries set
    missile_1 = missile_1 - case when p_missile_code = 'missile_1' then 1 else 0 end,
    missile_2 = missile_2 - case when p_missile_code = 'missile_2' then 1 else 0 end,
    missile_3 = missile_3 - case when p_missile_code = 'missile_3' then 1 else 0 end
  where id = p_country_id;

  v_intercepted := v_region.aa_defense >= v_required_aa;

  if v_intercepted then
    v_result := 'PRZECHWYCONA';
    update public.regions set aa_defense = aa_defense - v_required_aa where id = p_region_id;
    update public.countries set aa_defense = greatest(aa_defense - v_required_aa, 0) where id = v_region.country_id;
  else
    v_result := 'CEL ZNISZCZONY';
    select coalesce(jsonb_agg(jsonb_build_object('slot_id', s.id, 'slot_index', s.slot_index, 'building', s.building)), '[]'::jsonb)
      into v_destroyed
    from public.region_slots s where s.id = any(v_targets);
    delete from public.region_slots where id = any(v_targets);
  end if;

  insert into public.missile_strikes (attacker_country_id, defender_country_id, region_id, region_name,
    missile_code, result, aa_defense, destroyed, actor_id, region_aa, required_aa)
  values (p_country_id, v_region.country_id, p_region_id, v_region.name, p_missile_code, v_result,
    v_region.aa_defense, v_destroyed, auth.uid(), v_region.aa_defense, v_required_aa);

  v_label := 'Atak rakietowy na ' || v_def.name || ' (' || v_region.name || '): ' || v_result;
  insert into public.transactions (country_id, kind, label, amount_kr, actor_id, details)
  values (p_country_id, 'STRIKE', v_label, 0, auth.uid(),
    jsonb_build_object('missile', p_missile_code, 'region', v_region.name, 'result', v_result,
      'destroyed', v_destroyed, 'required_aa', v_required_aa, 'region_aa', v_region.aa_defense));

  insert into public.transactions (country_id, kind, label, amount_kr, actor_id, details)
  values (v_region.country_id, 'DEFENSE',
    'Atak rakietowy z ' || v_att.name || ' na region ' || v_region.name || ': ' || v_result,
    0, auth.uid(),
    jsonb_build_object('missile', p_missile_code, 'attacker', v_att.name, 'result', v_result,
      'destroyed', v_destroyed, 'required_aa', v_required_aa, 'region_aa', v_region.aa_defense));

  return jsonb_build_object('ok', true, 'result', v_result, 'destroyed', v_destroyed,
    'required_aa', v_required_aa, 'region_aa', v_region.aa_defense);
end;
$function$;

-- Salwa: każda rakieta rozpatrywana osobno wobec bieżącego stanu OPL regionu
create or replace function public.launch_salvo(p_country_id uuid, p_missile_code text, p_region_id uuid,
  p_slot_ids uuid[] default '{}'::uuid[], p_mode text default 'factories', p_count integer default 1)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  i int; v_res jsonb; v_results jsonb := '[]'::jsonb;
  v_intercepted int := 0; v_impacts int := 0; v_destroyed int := 0; v_err text;
begin
  if p_count is null or p_count < 1 or p_count > 100 then raise exception 'Nieprawidłowa liczba rakiet (1-100)'; end if;

  for i in 1..p_count loop
    begin
      v_res := public.launch_missile(p_country_id, p_missile_code, p_region_id, p_slot_ids, p_mode);
      if v_res->>'result' = 'PRZECHWYCONA' then
        v_intercepted := v_intercepted + 1;
      else
        v_impacts := v_impacts + 1;
        v_destroyed := v_destroyed + coalesce(jsonb_array_length(v_res->'destroyed'), 0);
      end if;
      v_results := v_results || jsonb_build_object('index', i, 'result', v_res->>'result');
    exception when others then
      v_err := sqlerrm;
      if i = 1 then raise exception '%', v_err; end if;
      exit;
    end;
  end loop;

  return jsonb_build_object('ok', true, 'launched', v_intercepted + v_impacts,
    'intercepted', v_intercepted, 'impacts', v_impacts, 'destroyed', v_destroyed,
    'results', v_results, 'stopped_reason', v_err);
end;
$function$;

grant execute on function public.launch_salvo(uuid, text, uuid, uuid[], text, integer) to authenticated;
