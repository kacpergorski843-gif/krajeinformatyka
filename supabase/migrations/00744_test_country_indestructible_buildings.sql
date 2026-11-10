-- 00744: fill both isolated test worlds with permanent, inert buildings.
-- Regular countries retain the existing economy, ranking and demolition rules.

-- Every test region gets four factories and all five resource facilities.
-- The nine slots are the region's full supported capacity.
insert into public.region_slots (region_id, slot_index, building)
select r.id, layout.slot_index, layout.building::public.building_type
from public.regions r
join public.countries c on c.id = r.country_id
cross join (values
  (1, 'factory_1'),
  (2, 'factory_2'),
  (3, 'factory_3'),
  (4, 'factory_4'),
  (5, 'mine_coal'),
  (6, 'mine_oil'),
  (7, 'mine_copper'),
  (8, 'mine_iron'),
  (9, 'mine_uranium')
) as layout(slot_index, building)
where c.name in ('Testy v1', 'Testy v2')
on conflict (region_id, slot_index)
do update set building = excluded.building;

-- Test buildings cannot be deleted through any path (missiles, RPCs or direct SQL).
-- Returning NULL from a BEFORE DELETE trigger makes the attempted deletion a no-op;
-- the missile RPC can still record its normal CEL ZNISZCZONY result and target list.
create or replace function public.protect_test_country_buildings()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if exists (
    select 1
    from public.regions r
    join public.countries c on c.id = r.country_id
    where r.id = old.region_id
      and c.name in ('Testy v1', 'Testy v2')
  ) then
    return null;
  end if;
  return old;
end;
$function$;

drop trigger if exists protect_test_country_buildings on public.region_slots;
create trigger protect_test_country_buildings
before delete on public.region_slots
for each row execute function public.protect_test_country_buildings();

-- Prevent demolition from awarding a refund when the protected DELETE is skipped.
-- The rest of the original refund behavior is unchanged for regular countries.
create or replace function public.demolish_slot(p_slot_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_country uuid;
  v_building public.building_type;
  v_built_at timestamptz;
  v_built_by uuid;
  v_item public.shop_items;
  v_refund_percent numeric := 0;
  v_paid_build boolean := false;
  v_has_produced_income boolean := false;
  v_refund_kr numeric := 0;
  v_refund_coal numeric := 0;
  v_refund_oil numeric := 0;
  v_refund_copper numeric := 0;
  v_refund_iron numeric := 0;
  v_refund_uranium numeric := 0;
begin
  select r.country_id, s.building, s.built_at, s.built_by
    into v_country, v_building, v_built_at, v_built_by
  from public.region_slots s
  join public.regions r on r.id = s.region_id
  where s.id = p_slot_id
  for update of s, r;

  if v_country is null then
    raise exception 'Nie znaleziono obiektu';
  end if;

  perform public.assert_can_manage(v_country);

  if exists (
    select 1 from public.countries
    where id = v_country and name in ('Testy v1', 'Testy v2')
  ) then
    raise exception 'Budynki w państwach testowych są niezniszczalne';
  end if;

  v_paid_build := v_built_by is not null;

  select *
    into v_item
  from public.shop_items
  where building = v_building
    and active
  order by sort_order
  limit 1;

  if v_item.code is null then
    raise exception 'Nie znaleziono kosztu tego obiektu';
  end if;

  if v_paid_build then
    select exists (
      select 1
      from public.transactions t
      where t.country_id = v_country
        and t.kind = 'ECONOMY'
        and t.created_at >= v_built_at
    )
    into v_has_produced_income;

    if v_has_produced_income then
      v_refund_percent := 0.5;
    else
      v_refund_percent := 1;
    end if;

    v_refund_kr := v_item.cost_kr * v_refund_percent;
    v_refund_coal := v_item.cost_coal * v_refund_percent;
    v_refund_oil := v_item.cost_oil * v_refund_percent;
    v_refund_copper := v_item.cost_copper * v_refund_percent;
    v_refund_iron := v_item.cost_iron * v_refund_percent;
    v_refund_uranium := v_item.cost_uranium * v_refund_percent;
  end if;

  delete from public.region_slots where id = p_slot_id;

  update public.countries
  set
    balance = balance + v_refund_kr,
    coal = coal + v_refund_coal,
    oil = oil + v_refund_oil,
    copper = copper + v_refund_copper,
    iron = iron + v_refund_iron,
    uranium = uranium + v_refund_uranium
  where id = v_country;

  insert into public.transactions (country_id, kind, label, amount_kr, actor_id, details)
  values (
    v_country,
    'DEMOLISH',
    'Rozbiórka: ' || v_item.name,
    v_refund_kr,
    auth.uid(),
    jsonb_build_object(
      'slot_id', p_slot_id,
      'building', v_building::text,
      'built_at', v_built_at,
      'paid_build', v_paid_build,
      'has_produced_income', v_has_produced_income,
      'refund_percent', v_refund_percent,
      'refund_kr', v_refund_kr,
      'refund_coal', v_refund_coal,
      'refund_oil', v_refund_oil,
      'refund_copper', v_refund_copper,
      'refund_iron', v_refund_iron,
      'refund_uranium', v_refund_uranium
    )
  );

  return jsonb_build_object(
    'ok', true,
    'paid_build', v_paid_build,
    'has_produced_income', v_has_produced_income,
    'refund_percent', v_refund_percent,
    'refund_kr', v_refund_kr,
    'refund_coal', v_refund_coal,
    'refund_oil', v_refund_oil,
    'refund_copper', v_refund_copper,
    'refund_iron', v_refund_iron,
    'refund_uranium', v_refund_uranium
  );
end;
$function$;

grant execute on function public.demolish_slot(uuid) to authenticated;

-- Test worlds display zero income and zero production, and therefore never
-- receive resources or currency from the daily economy. All other countries
-- keep the exact same live shop_items-derived calculations.
create or replace view public.country_stats
with (security_invoker = true) as
select
  c.id as country_id,
  c.name,
  c.flag,
  c.balance,
  c.coal,
  c.oil,
  c.copper,
  c.iron,
  c.uranium,
  c.aa_defense,
  c.missile_1,
  c.missile_2,
  c.missile_3,
  c.soldier_packs,
  c.tank_packs,
  least(c.soldier_packs, 6) + least(c.tank_packs, 4) as war_votes,
  coalesce(b.regions_count, 0) as regions_count,
  case when c.name in ('Testy v1', 'Testy v2') then 0::numeric
       else coalesce(b.gross_income, 0)::numeric(30,0) end as gross_income,
  case when c.name in ('Testy v1', 'Testy v2') then 0::numeric
       else coalesce(b.coal_upkeep, 0)::numeric(30,0) end as coal_upkeep,
  case when c.name in ('Testy v1', 'Testy v2') then 0::numeric
       else coalesce(b.coal_prod, 0)::numeric(30,0) end as coal_prod,
  case when c.name in ('Testy v1', 'Testy v2') then 0::numeric
       else coalesce(b.oil_prod, 0)::numeric(30,0) end as oil_prod,
  case when c.name in ('Testy v1', 'Testy v2') then 0::numeric
       else coalesce(b.copper_prod, 0)::numeric(30,0) end as copper_prod,
  case when c.name in ('Testy v1', 'Testy v2') then 0::numeric
       else coalesce(b.iron_prod, 0)::numeric(30,0) end as iron_prod,
  case when c.name in ('Testy v1', 'Testy v2') then 0::numeric
       else coalesce(b.uranium_prod, 0)::numeric(30,0) end as uranium_prod,
  coalesce(b.forts, 0) as forts,
  (
    c.aa_defense::numeric * 1000000000
    + c.missile_1::numeric * 2000000000
    + c.missile_2::numeric * 5000000000
    + c.missile_3::numeric * 12000000000
    + c.soldier_packs::numeric * 20000000000
    + c.tank_packs::numeric * 30000000000
    + coalesce(b.forts, 0)::numeric * 40000000000
  )::numeric(30,0) as military_value,
  coalesce(b.fort_votes, 0)::int as fort_votes,
  (
    least(c.soldier_packs, 6)
    + least(c.tank_packs, 4)
    + coalesce(b.fort_votes, 0)
  )::int as total_votes,
  (least(c.soldier_packs, 6) + least(c.tank_packs, 4))::int as vote_potential,
  coalesce(b.region_aa_total, 0)::int as region_aa_total
from public.countries c
left join (
  select
    r.country_id,
    count(distinct r.id) as regions_count,
    sum(coalesce(si.income_kr, 0)) as gross_income,
    sum(coalesce(si.upkeep_coal, 0)) as coal_upkeep,
    sum(case when si.produces = 'coal' then coalesce(si.produces_amount, 0) else 0 end) as coal_prod,
    sum(case when si.produces = 'oil' then coalesce(si.produces_amount, 0) else 0 end) as oil_prod,
    sum(case when si.produces = 'copper' then coalesce(si.produces_amount, 0) else 0 end) as copper_prod,
    sum(case when si.produces = 'iron' then coalesce(si.produces_amount, 0) else 0 end) as iron_prod,
    sum(case when si.produces = 'uranium' then coalesce(si.produces_amount, 0) else 0 end) as uranium_prod,
    count(s.id) filter (where s.building in ('fort_1','fort_2','fort_3')) as forts,
    sum(case s.building
      when 'fort_1' then 1
      when 'fort_2' then 2
      when 'fort_3' then 3
      else 0
    end) as fort_votes,
    (
      select sum(r2.aa_defense)
      from public.regions r2
      where r2.country_id = r.country_id
    ) as region_aa_total
  from public.regions r
  left join public.region_slots s on s.region_id = r.id
  left join public.shop_items si on si.building = s.building
  group by r.country_id
) b on b.country_id = c.id;

grant select on public.country_stats to authenticated;

-- Public ranking also reports zero income for the test countries; normal
-- countries' public-ranking values are unaffected.
create or replace view public.public_ranking
with (security_invoker = false) as
select
  c.id as country_id,
  c.name,
  c.flag,
  case when c.name in ('Testy v1', 'Testy v2') then 0::numeric(30,0)
       else coalesce(x.gross_income,0::numeric)::numeric(30,0) end as gross_income,
  (
    c.aa_defense::numeric * 1000000000
    + c.missile_1::numeric * 2000000000
    + c.missile_2::numeric * 5000000000
    + c.missile_3::numeric * 12000000000
    + c.soldier_packs::numeric * 20000000000
    + c.tank_packs::numeric * 30000000000
    + coalesce(x.fort_votes,0)::numeric * 40000000000
  )::numeric(30,0) as military_value,
  least(c.soldier_packs, 6) + least(c.tank_packs, 4) as war_votes,
  coalesce(x.regions_count,0)::int as regions_count
from public.countries c
left join (
  select
    r.country_id,
    count(distinct r.id) as regions_count,
    sum(coalesce(si.income_kr, 0)) as gross_income,
    sum(case s.building
      when 'fort_1' then 1
      when 'fort_2' then 2
      when 'fort_3' then 3
      else 0
    end) as fort_votes
  from public.regions r
  left join public.region_slots s on s.region_id = r.id
  left join public.shop_items si on si.building = s.building
  group by r.country_id
) x on x.country_id = c.id
where c.name not in ('Testy v1', 'Testy v2')
   or public.has_role(auth.uid(), 'MAIN_ADMIN');

grant select on public.public_ranking to anon, authenticated;
notify pgrst, 'reload schema';
