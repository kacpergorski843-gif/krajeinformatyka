-- Factory VI: full gameplay support
-- Add the new building type without rewriting previously applied migrations.
ALTER TYPE public.building_type ADD VALUE IF NOT EXISTS 'factory_6';

-- Make the new factory available in the shop.
INSERT INTO public.shop_items (
  code, name, category, description, building,
  cost_kr, income_kr, upkeep_coal, sort_order, active
)
VALUES (
  'factory_6',
  'Fabryka poziom 6',
  'buildings',
  'Najwyższy poziom fabryki. Zapewnia 400 mld KR dziennie, ale zużywa 150 węgla.',
  'factory_6',
  400000000000,
  400000000000,
  150,
  60,
  true
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  building = EXCLUDED.building,
  cost_kr = EXCLUDED.cost_kr,
  income_kr = EXCLUDED.income_kr,
  upkeep_coal = EXCLUDED.upkeep_coal,
  sort_order = EXCLUDED.sort_order,
  active = EXCLUDED.active;

-- Include factory VI in country statistics used by the UI and economy.
CREATE OR REPLACE VIEW public.country_stats
WITH (security_invoker = true) AS
SELECT
  c.id AS country_id, c.name, c.flag, c.balance, c.coal, c.oil, c.copper, c.iron, c.uranium,
  c.aa_defense, c.missile_1, c.missile_2, c.missile_3, c.soldier_packs, c.tank_packs,
  least(c.soldier_packs,6) + least(c.tank_packs,4) AS war_votes,
  coalesce(b.regions_count,0) AS regions_count,
  coalesce(b.gross_income,0::numeric)::numeric(30,0) AS gross_income,
  coalesce(b.coal_upkeep,0)::numeric(30,0) AS coal_upkeep,
  coalesce(b.coal_prod,0)::numeric(30,0) AS coal_prod,
  coalesce(b.oil_prod,0)::numeric(30,0) AS oil_prod,
  coalesce(b.copper_prod,0)::numeric(30,0) AS copper_prod,
  coalesce(b.iron_prod,0)::numeric(30,0) AS iron_prod,
  coalesce(b.uranium_prod,0)::numeric(30,0) AS uranium_prod,
  coalesce(b.forts,0) AS forts,
  (c.aa_defense::numeric * 1000000000
   + c.missile_1::numeric * 2000000000
   + c.missile_2::numeric * 5000000000
   + c.missile_3::numeric * 12000000000
   + c.soldier_packs::numeric * 20000000000
   + c.tank_packs::numeric * 30000000000
   + coalesce(b.forts,0)::numeric * 40000000000)::numeric(30,0) AS military_value,
  coalesce(b.fort_votes,0)::int AS fort_votes,
  (least(c.soldier_packs,6) + least(c.tank_packs,4) + coalesce(b.fort_votes,0))::int AS total_votes
FROM public.countries c
LEFT JOIN (
  SELECT r.country_id,
    count(distinct r.id) AS regions_count,
    sum(case s.building
      when 'factory_1' then 20000000000
      when 'factory_2' then 50000000000
      when 'factory_3' then 80000000000
      when 'factory_4' then 150000000000
      when 'factory_5' then 250000000000
      when 'factory_6' then 400000000000
      else 0 end) AS gross_income,
    sum(case s.building
      when 'factory_4' then 50
      when 'factory_5' then 100
      when 'factory_6' then 150
      else 0 end) AS coal_upkeep,
    sum(case when s.building = 'mine_coal' then 100 else 0 end) AS coal_prod,
    sum(case when s.building = 'mine_oil' then 100 else 0 end) AS oil_prod,
    sum(case when s.building = 'mine_copper' then 100 else 0 end) AS copper_prod,
    sum(case when s.building = 'mine_iron' then 100 else 0 end) AS iron_prod,
    sum(case when s.building = 'mine_uranium' then 25 else 0 end) AS uranium_prod,
    count(s.id) filter (where s.building in ('fort_1','fort_2','fort_3')) AS forts,
    sum(case s.building
      when 'fort_1' then 1
      when 'fort_2' then 2
      when 'fort_3' then 3
      else 0 end) AS fort_votes
  FROM public.regions r
  LEFT JOIN public.region_slots s ON s.region_id = r.id
  GROUP BY r.country_id
) b ON b.country_id = c.id;

GRANT SELECT ON public.country_stats TO authenticated;

-- Update the daily economy's special no-coal penalty to include factory VI.
CREATE OR REPLACE FUNCTION public.run_daily_economy(
  p_run_date date default (now() at time zone 'Europe/Warsaw')::date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_income numeric;
  v_coal numeric;
  v_upkeep numeric;
  v_processed int := 0;
  v_total numeric := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Tylko administrator może uruchomić cykl dobowy';
  END IF;

  INSERT INTO public.economy_runs (run_date, triggered_by)
  VALUES (p_run_date, auth.uid())
  ON CONFLICT (run_date) DO NOTHING;

  IF NOT found THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_run', 'run_date', p_run_date);
  END IF;

  FOR r IN SELECT * FROM public.country_stats LOOP
    v_coal := r.coal + r.coal_prod;
    v_upkeep := r.coal_upkeep;
    v_income := r.gross_income;

    IF v_upkeep > 0 AND v_coal < v_upkeep THEN
      v_income := v_income - (
        SELECT coalesce(sum(case s.building
          when 'factory_4' then 150000000000
          when 'factory_5' then 250000000000
          when 'factory_6' then 400000000000
          else 0 end),0)
        FROM public.region_slots s
        JOIN public.regions g ON g.id = s.region_id
        WHERE g.country_id = r.country_id
          AND s.building IN ('factory_4','factory_5','factory_6')
      );
      v_upkeep := 0;
    END IF;

    UPDATE public.countries SET
      balance = balance + v_income,
      coal = coal + r.coal_prod - v_upkeep,
      oil = oil + r.oil_prod,
      copper = copper + r.copper_prod,
      iron = iron + r.iron_prod,
      uranium = uranium + r.uranium_prod
    WHERE id = r.country_id;

    INSERT INTO public.transactions (country_id, kind, label, amount_kr, details)
    VALUES (
      r.country_id, 'ECONOMY', 'Cykl dobowy ' || p_run_date, v_income,
      jsonb_build_object(
        'coal_prod', r.coal_prod,
        'coal_upkeep', v_upkeep,
        'oil', r.oil_prod,
        'copper', r.copper_prod,
        'iron', r.iron_prod,
        'uranium', r.uranium_prod
      )
    );

    v_processed := v_processed + 1;
    v_total := v_total + v_income;
  END LOOP;

  UPDATE public.economy_runs
  SET summary = jsonb_build_object('countries', v_processed, 'total_kr', v_total)
  WHERE run_date = p_run_date;

  RETURN jsonb_build_object('ok', true, 'countries', v_processed, 'total_kr', v_total);
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_daily_economy(date) TO authenticated;
