-- 0054: keep public military ranking formula identical to country_stats.

create or replace view public.public_ranking
with (security_invoker = false) as
select
  c.id as country_id,
  c.name,
  c.flag,
  coalesce(x.gross_income,0::numeric)::numeric(30,0) as gross_income,
  (
    c.aa_defense::numeric * 1000000000
    + c.missile_1::numeric * 2000000000
    + c.missile_2::numeric * 5000000000
    + c.missile_3::numeric * 12000000000
    + c.soldier_packs::numeric * 20000000000
    + c.tank_packs::numeric * 30000000000
    + coalesce(x.fort_votes,0)::numeric * 40000000000
  )::numeric(30,0) as military_value,
  coalesce(x.regions_count,0)::int as regions_count
from public.countries c
left join (
  select
    r.country_id,
    count(distinct r.id) as regions_count,
    sum(
      case s.building
        when 'factory_1' then 20000000000
        when 'factory_2' then 50000000000
        when 'factory_3' then 80000000000
        when 'factory_4' then 150000000000
        when 'factory_5' then 250000000000
        when 'factory_6' then 400000000000
        else 0
      end
    ) as gross_income,
    sum(
      case s.building
        when 'fort_1' then 1
        when 'fort_2' then 2
        when 'fort_3' then 3
        else 0
      end
    ) as fort_votes
  from public.regions r
  left join public.region_slots s on s.region_id = r.id
  group by r.country_id
) x on x.country_id = c.id;

grant select on public.public_ranking to anon, authenticated;

notify pgrst, 'reload schema';
