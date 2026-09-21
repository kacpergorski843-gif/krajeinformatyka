-- 0030 RESOURCE PRODUCTION SYNC
-- Keep country/world production statistics derived directly from region_slots.
-- A mine is the single source of truth for daily resource production.

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
  coalesce(b.gross_income, 0)::numeric(30,0) as gross_income,
  coalesce(b.coal_upkeep, 0)::numeric(30,0) as coal_upkeep,
  coalesce(b.coal_prod, 0)::numeric(30,0) as coal_prod,
  coalesce(b.oil_prod, 0)::numeric(30,0) as oil_prod,
  coalesce(b.copper_prod, 0)::numeric(30,0) as copper_prod,
  coalesce(b.iron_prod, 0)::numeric(30,0) as iron_prod,
  coalesce(b.uranium_prod, 0)::numeric(30,0) as uranium_prod,
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
    sum(case s.building
      when 'factory_1' then 20000000000
      when 'factory_2' then 50000000000
      when 'factory_3' then 80000000000
      when 'factory_4' then 150000000000
      when 'factory_5' then 250000000000
      when 'factory_6' then 400000000000
      else 0
    end) as gross_income,
    sum(case s.building
      when 'factory_4' then 50
      when 'factory_5' then 100
      when 'factory_6' then 150
      else 0
    end) as coal_upkeep,
    sum(case when s.building = 'mine_coal' then 100 else 0 end) as coal_prod,
    sum(case when s.building = 'mine_oil' then 100 else 0 end) as oil_prod,
    sum(case when s.building = 'mine_copper' then 100 else 0 end) as copper_prod,
    sum(case when s.building = 'mine_iron' then 100 else 0 end) as iron_prod,
    sum(case when s.building = 'mine_uranium' then 25 else 0 end) as uranium_prod,
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
  group by r.country_id
) b on b.country_id = c.id;

grant select on public.country_stats to authenticated;

create or replace view public.world_country_stats
with (security_invoker = false) as
select
  country_id,
  name,
  flag,
  balance,
  coal,
  oil,
  copper,
  iron,
  uranium,
  aa_defense,
  missile_1,
  missile_2,
  missile_3,
  soldier_packs,
  tank_packs,
  war_votes,
  fort_votes,
  total_votes,
  regions_count,
  gross_income,
  coal_upkeep,
  coal_prod,
  oil_prod,
  copper_prod,
  iron_prod,
  uranium_prod,
  forts,
  military_value,
  vote_potential,
  region_aa_total
from public.country_stats;

grant select on public.world_country_stats to authenticated;
