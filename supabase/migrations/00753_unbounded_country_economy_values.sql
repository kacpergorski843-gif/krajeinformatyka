-- Remove arbitrary precision limits from persistent country economy values.
-- Keep exact integer arithmetic; PostgreSQL unconstrained NUMERIC has no fixed
-- 30/60 digit precision ceiling (subject to PostgreSQL's implementation limit).

-- These views depend on country_stats and/or expose its column typmods.
DROP VIEW IF EXISTS public.world_country_stats;
DROP VIEW IF EXISTS public.public_ranking;
DROP VIEW IF EXISTS public.country_stats;

ALTER TABLE public.countries
  ALTER COLUMN balance TYPE numeric USING balance::numeric,
  ALTER COLUMN coal TYPE numeric USING coal::numeric,
  ALTER COLUMN oil TYPE numeric USING oil::numeric,
  ALTER COLUMN copper TYPE numeric USING copper::numeric,
  ALTER COLUMN iron TYPE numeric USING iron::numeric,
  ALTER COLUMN uranium TYPE numeric USING uranium::numeric;

-- Keep the transaction ledger and configurable economy inputs in step with
-- the unbounded country balances and aggregates.
ALTER TABLE public.transactions
  ALTER COLUMN amount_kr TYPE numeric USING amount_kr::numeric;

ALTER TABLE public.shop_items
  ALTER COLUMN cost_kr TYPE numeric USING cost_kr::numeric,
  ALTER COLUMN cost_coal TYPE numeric USING cost_coal::numeric,
  ALTER COLUMN cost_oil TYPE numeric USING cost_oil::numeric,
  ALTER COLUMN cost_copper TYPE numeric USING cost_copper::numeric,
  ALTER COLUMN cost_iron TYPE numeric USING cost_iron::numeric,
  ALTER COLUMN cost_uranium TYPE numeric USING cost_uranium::numeric,
  ALTER COLUMN income_kr TYPE numeric USING income_kr::numeric,
  ALTER COLUMN upkeep_coal TYPE numeric USING upkeep_coal::numeric,
  ALTER COLUMN produces_amount TYPE numeric USING produces_amount::numeric;

-- Rebuild country_stats without numeric(30,0) casts on income and resource
-- aggregates. military_value remains unchanged here; military counters are
-- handled separately in point 2.
CREATE VIEW public.country_stats
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
    + coalesce(b.forts, 0)::numeric * 40000000000
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

-- Recreate the restricted world view against the new country_stats definition.
CREATE VIEW public.world_country_stats
WITH (security_invoker = false) AS
SELECT
  country_id, name, flag, balance, coal, oil, copper, iron, uranium,
  aa_defense, missile_1, missile_2, missile_3, soldier_packs, tank_packs,
  war_votes, fort_votes, total_votes, regions_count, gross_income, coal_upkeep,
  coal_prod, oil_prod, copper_prod, iron_prod, uranium_prod, forts,
  military_value, vote_potential, region_aa_total
FROM public.country_stats
WHERE name NOT IN ('Testy v1', 'Testy v2')
   OR public.has_role(auth.uid(), 'MAIN_ADMIN');

GRANT SELECT ON public.world_country_stats TO authenticated;

-- Keep the public ranking's income metric unbounded as well. Preserve the
-- existing test-country visibility rule and ranking formula.
CREATE VIEW public.public_ranking
WITH (security_invoker = false) AS
SELECT
  c.id AS country_id,
  c.name,
  c.flag,
  coalesce(x.gross_income, 0::numeric) AS gross_income,
  (
    c.aa_defense::numeric * 1000000000
    + c.missile_1::numeric * 2000000000
    + c.missile_2::numeric * 5000000000
    + c.missile_3::numeric * 12000000000
    + c.soldier_packs::numeric * 20000000000
    + c.tank_packs::numeric * 30000000000
    + coalesce(x.fort_votes, 0)::numeric * 40000000000
  )::numeric(30,0) AS military_value,
  least(c.soldier_packs, 6) + least(c.tank_packs, 4) AS war_votes,
  coalesce(x.regions_count, 0)::int AS regions_count
FROM public.countries c
LEFT JOIN (
  SELECT
    r.country_id,
    count(distinct r.id) AS regions_count,
    sum(coalesce(si.income_kr, 0)) AS gross_income,
    sum(case s.building
      when 'fort_1' then 1
      when 'fort_2' then 2
      when 'fort_3' then 3
      else 0
    end) AS fort_votes
  FROM public.regions r
  LEFT JOIN public.region_slots s ON s.region_id = r.id
  LEFT JOIN public.shop_items si ON si.building = s.building
  GROUP BY r.country_id
) x ON x.country_id = c.id
WHERE c.name NOT IN ('Testy v1', 'Testy v2')
   OR public.has_role(auth.uid(), 'MAIN_ADMIN');

GRANT SELECT ON public.public_ranking TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
