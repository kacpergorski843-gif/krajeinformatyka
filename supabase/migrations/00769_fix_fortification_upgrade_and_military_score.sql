-- 00769: allow sequential fort upgrades in the region UI and align military scoring.
-- Fort II/III replace the previous fort in the same slot; only a new Fort I
-- should be blocked by the one-fort-per-region rule.
-- Keep country_stats military_value consistent with public_ranking by scoring
-- forts by level (fort_votes), not by the number of fort buildings.

CREATE OR REPLACE VIEW public.country_stats
WITH (security_invoker = true) AS
SELECT
  c.id AS country_id,
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
  least(c.soldier_packs, 6) + least(c.tank_packs, 4) AS war_votes,
  coalesce(b.regions_count, 0) AS regions_count,
  coalesce(b.gross_income, 0::numeric) AS gross_income,
  coalesce(b.coal_upkeep, 0::numeric) AS coal_upkeep,
  coalesce(b.coal_prod, 0::numeric) AS coal_prod,
  coalesce(b.oil_prod, 0::numeric) AS oil_prod,
  coalesce(b.copper_prod, 0::numeric) AS copper_prod,
  coalesce(b.iron_prod, 0::numeric) AS iron_prod,
  coalesce(b.uranium_prod, 0::numeric) AS uranium_prod,
  coalesce(b.forts, 0) AS forts,
  (
    c.aa_defense::numeric * 1000000000
    + c.missile_1::numeric * 2000000000
    + c.missile_2::numeric * 5000000000
    + c.missile_3::numeric * 12000000000
    + c.soldier_packs::numeric * 20000000000
    + c.tank_packs::numeric * 30000000000
    + coalesce(b.fort_votes, 0)::numeric * 40000000000
  )::numeric(30,0) AS military_value,
  least(coalesce(b.fort_votes, 0), 2147483647)::int AS fort_votes,
  least(
    least(c.soldier_packs, 6)
    + least(c.tank_packs, 4)
    + coalesce(b.fort_votes, 0),
    2147483647
  )::int AS total_votes,
  (least(c.soldier_packs, 6) + least(c.tank_packs, 4))::int AS vote_potential,
  least(coalesce(b.region_aa_total, 0), 2147483647)::int AS region_aa_total
FROM public.countries c
LEFT JOIN (
  SELECT
    r.country_id,
    count(distinct r.id) AS regions_count,
    sum(coalesce(si.income_kr, 0)) AS gross_income,
    sum(coalesce(si.upkeep_coal, 0)) AS coal_upkeep,
    sum(case when si.produces = 'coal' then coalesce(si.produces_amount, 0) else 0 end) AS coal_prod,
    sum(case when si.produces = 'oil' then coalesce(si.produces_amount, 0) else 0 end) AS oil_prod,
    sum(case when si.produces = 'copper' then coalesce(si.produces_amount, 0) else 0 end) AS copper_prod,
    sum(case when si.produces = 'iron' then coalesce(si.produces_amount, 0) else 0 end) AS iron_prod,
    sum(case when si.produces = 'uranium' then coalesce(si.produces_amount, 0) else 0 end) AS uranium_prod,
    count(s.id) FILTER (WHERE s.building IN ('fort_1','fort_2','fort_3')) AS forts,
    sum(case s.building
      when 'fort_1' then 1
      when 'fort_2' then 2
      when 'fort_3' then 3
      else 0
    end) AS fort_votes,
    (
      SELECT sum(r2.aa_defense)
      FROM public.regions r2
      WHERE r2.country_id = r.country_id
    ) AS region_aa_total
  FROM public.regions r
  LEFT JOIN public.region_slots s ON s.region_id = r.id
  LEFT JOIN public.shop_items si ON si.building = s.building
  GROUP BY r.country_id
) b ON b.country_id = c.id;

GRANT SELECT ON public.country_stats TO authenticated;

NOTIFY pgrst, 'reload schema';
