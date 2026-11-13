-- Replace PostgreSQL INTEGER ceilings on military inventories with exact,
-- unbounded NUMERIC values. All counts remain whole, non-negative units.

ALTER TABLE public.countries
  ALTER COLUMN aa_defense TYPE numeric USING aa_defense::numeric,
  ALTER COLUMN missile_1 TYPE numeric USING missile_1::numeric,
  ALTER COLUMN missile_2 TYPE numeric USING missile_2::numeric,
  ALTER COLUMN missile_3 TYPE numeric USING missile_3::numeric,
  ALTER COLUMN soldier_packs TYPE numeric USING soldier_packs::numeric,
  ALTER COLUMN tank_packs TYPE numeric USING tank_packs::numeric;

ALTER TABLE public.regions
  ALTER COLUMN aa_defense TYPE numeric USING aa_defense::numeric;

ALTER TABLE public.missile_strikes
  ALTER COLUMN aa_defense TYPE numeric USING aa_defense::numeric,
  ALTER COLUMN region_aa TYPE numeric USING region_aa::numeric,
  ALTER COLUMN required_aa TYPE numeric USING required_aa::numeric;

-- Keep military inventories integral and non-negative after removing INTEGER.
DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.countries'::regclass
      AND conname = 'countries_military_counts_whole_nonnegative'
  ) THEN
    ALTER TABLE public.countries
      ADD CONSTRAINT countries_military_counts_whole_nonnegative
      CHECK (
        aa_defense = trunc(aa_defense)
        AND missile_1 = trunc(missile_1)
        AND missile_2 = trunc(missile_2)
        AND missile_3 = trunc(missile_3)
        AND soldier_packs = trunc(soldier_packs)
        AND tank_packs = trunc(tank_packs)
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.regions'::regclass
      AND conname = 'regions_aa_defense_whole'
  ) THEN
    ALTER TABLE public.regions
      ADD CONSTRAINT regions_aa_defense_whole
      CHECK (aa_defense = trunc(aa_defense)) NOT VALID;
  END IF;
END;
$constraints$;

-- Rebuild the dependent views while retaining their current query logic and
-- test-country visibility rules. Remove the old INTEGER clamp on region OPL
-- and the old 30-digit cap on derived military value.
DO $views$
DECLARE
  v_country_stats text;
  v_world_country_stats text;
  v_public_ranking text;
BEGIN
  v_country_stats := pg_get_viewdef('public.country_stats'::regclass, true);
  v_world_country_stats := pg_get_viewdef('public.world_country_stats'::regclass, true);
  v_public_ranking := pg_get_viewdef('public.public_ranking'::regclass, true);

  v_country_stats := regexp_replace(
    v_country_stats,
    '::numeric[[:space:]]*\([[:space:]]*30[[:space:]]*,[[:space:]]*0[[:space:]]*\)',
    '',
    'gi'
  );
  v_country_stats := regexp_replace(
    v_country_stats,
    'least[[:space:]]*\([[:space:]]*coalesce[[:space:]]*\([[:space:]]*b\.region_aa_total[[:space:]]*,[[:space:]]*0[[:space:]]*\)[[:space:]]*,[[:space:]]*2147483647[[:space:]]*\)[[:space:]]*::[[:space:]]*(integer|int)[[:space:]]+AS[[:space:]]+region_aa_total',
    'coalesce(b.region_aa_total, 0::numeric) AS region_aa_total',
    'gi'
  );
  v_public_ranking := regexp_replace(
    v_public_ranking,
    '::numeric[[:space:]]*\([[:space:]]*30[[:space:]]*,[[:space:]]*0[[:space:]]*\)',
    '',
    'gi'
  );

  IF v_country_stats ~* 'least[[:space:]]*\([[:space:]]*coalesce[[:space:]]*\([[:space:]]*b\.region_aa_total' THEN
    RAISE EXCEPTION 'Nie udało się usunąć limitu INTEGER z region_aa_total';
  END IF;
  IF v_country_stats ~* 'numeric[[:space:]]*\([[:space:]]*30[[:space:]]*,[[:space:]]*0' THEN
    RAISE EXCEPTION 'country_stats nadal zawiera limit numeric(30,0)';
  END IF;
  IF v_public_ranking ~* 'numeric[[:space:]]*\([[:space:]]*30[[:space:]]*,[[:space:]]*0' THEN
    RAISE EXCEPTION 'public_ranking nadal zawiera limit numeric(30,0)';
  END IF;

  DROP VIEW public.world_country_stats;
  DROP VIEW public.public_ranking;
  DROP VIEW public.country_stats;

  EXECUTE 'CREATE VIEW public.country_stats WITH (security_invoker = true) AS ' || v_country_stats;
  EXECUTE 'CREATE VIEW public.world_country_stats WITH (security_invoker = false) AS ' || v_world_country_stats;
  EXECUTE 'CREATE VIEW public.public_ranking WITH (security_invoker = false) AS ' || v_public_ranking;

  GRANT SELECT ON public.country_stats TO authenticated;
  GRANT SELECT ON public.world_country_stats TO authenticated;
  GRANT SELECT ON public.public_ranking TO anon, authenticated;
END;
$views$;

-- Widen the regional OPL admin RPC without leaving its old INTEGER overload.
DO $admin_region_aa$
DECLARE
  v_def text;
BEGIN
  v_def := pg_get_functiondef('public.admin_set_region_aa(uuid, integer)'::regprocedure);
  v_def := replace(v_def, 'p_value integer', 'p_value numeric');
  EXECUTE 'DROP FUNCTION public.admin_set_region_aa(uuid, integer)';
  EXECUTE v_def;
  REVOKE ALL ON FUNCTION public.admin_set_region_aa(uuid, numeric) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.admin_set_region_aa(uuid, numeric) TO authenticated;
END;
$admin_region_aa$;

-- The admin country editor must cast military fields to NUMERIC, not INTEGER.
-- Keep the existing rule that country OPL is derived from regional OPL.
DO $admin_country$
DECLARE
  v_def text;
BEGIN
  v_def := pg_get_functiondef('public.admin_adjust_country(uuid, jsonb, text)'::regprocedure);
  v_def := replace(v_def, '::int', '::numeric');
  EXECUTE v_def;
  REVOKE ALL ON FUNCTION public.admin_adjust_country(uuid, jsonb, text) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.admin_adjust_country(uuid, jsonb, text) TO authenticated;
END;
$admin_country$;

-- Missile launch inventory checks must not cast a large stock back to INTEGER.
DO $missile$
DECLARE
  v_def text;
BEGIN
  v_def := pg_get_functiondef('public.launch_missile(uuid, text, uuid, uuid[], text)'::regprocedure);
  v_def := regexp_replace(v_def, 'v_have[[:space:]]+(integer|int)[[:space:]]*;', 'v_have numeric;', 'i');
  IF v_def !~* 'v_have[[:space:]]+numeric[[:space:]]*;' THEN
    RAISE EXCEPTION 'Nie udało się poszerzyć zmiennej stanu rakiet w launch_missile';
  END IF;
  EXECUTE v_def;
  REVOKE ALL ON FUNCTION public.launch_missile(uuid, text, uuid, uuid[], text) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.launch_missile(uuid, text, uuid, uuid[], text) TO authenticated;
END;
$missile$;

-- Military transfers accept arbitrary whole-unit quantities. Remove the old
-- INTEGER signature so clients cannot keep calling the narrow overload.
DO $military_transfer$
DECLARE
  v_def text;
BEGIN
  v_def := pg_get_functiondef('public.transfer_military(uuid, uuid, text, integer, uuid, uuid)'::regprocedure);
  v_def := replace(v_def, 'p_amount integer', 'p_amount numeric');
  v_def := replace(v_def, 'v_available integer;', 'v_available numeric;');
  v_def := replace(v_def, 'if p_amount is null or p_amount < 1 then', 'if p_amount is null or p_amount < 1 or p_amount <> trunc(p_amount) then');
  v_def := replace(v_def, '''amount'',p_amount', '''amount'',p_amount::text');
  IF v_def ~* 'p_amount[[:space:]]+integer' OR v_def ~* 'v_available[[:space:]]+integer' THEN
    RAISE EXCEPTION 'Nie udało się poszerzyć transfer_military do NUMERIC';
  END IF;

  EXECUTE 'DROP FUNCTION public.transfer_military(uuid, uuid, text, integer, uuid, uuid)';
  EXECUTE v_def;
  REVOKE ALL ON FUNCTION public.transfer_military(uuid, uuid, text, numeric, uuid, uuid) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.transfer_military(uuid, uuid, text, numeric, uuid, uuid) TO authenticated, service_role;
END;
$military_transfer$;

-- The generic resource transfer RPC must no longer move military stock
-- directly (especially country-level AA, which is derived from regions).
-- Preserve it for economic resources only and serialize large values as text.
DO $resource_transfer$
DECLARE
  v_def text;
BEGIN
  v_def := pg_get_functiondef('public.transfer_resource(uuid, uuid, text, numeric)'::regprocedure);
  v_def := replace(
    v_def,
    'if p_resource not in (''balance'',''coal'',''oil'',''copper'',''iron'',''uranium'',''aa_defense'',''soldier_packs'',''tank_packs'',''missile_1'',''missile_2'',''missile_3'') then',
    'if p_resource not in (''balance'',''coal'',''oil'',''copper'',''iron'',''uranium'') then'
  );
  v_def := replace(
    v_def,
    'if p_amount is null or p_amount <= 0 then',
    'if p_amount is null or p_amount <= 0 or p_amount <> trunc(p_amount) then'
  );
  v_def := replace(v_def, '''amount'',p_amount', '''amount'',p_amount::text');
  IF v_def ~* 'p_resource not in.*aa_defense' THEN
    RAISE EXCEPTION 'transfer_resource nadal dopuszcza transfery wojskowe';
  END IF;
  EXECUTE v_def;
  REVOKE ALL ON FUNCTION public.transfer_resource(uuid, uuid, text, numeric) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.transfer_resource(uuid, uuid, text, numeric) TO authenticated;
END;
$resource_transfer$;

-- Store payout amounts in transaction JSON as decimal strings so the browser
-- never rounds values above Number.MAX_SAFE_INTEGER while displaying history.
DO $economy_details$
DECLARE
  v_def text;
BEGIN
  v_def := pg_get_functiondef('public.run_daily_economy(date)'::regprocedure);
  v_def := replace(v_def, '''coal_prod'', r.coal_prod', '''coal_prod'', r.coal_prod::text');
  v_def := replace(v_def, '''coal_upkeep'', v_upkeep', '''coal_upkeep'', v_upkeep::text');
  v_def := replace(v_def, '''oil'', r.oil_prod', '''oil'', r.oil_prod::text');
  v_def := replace(v_def, '''copper'', r.copper_prod', '''copper'', r.copper_prod::text');
  v_def := replace(v_def, '''iron'', r.iron_prod', '''iron'', r.iron_prod::text');
  v_def := replace(v_def, '''uranium'', r.uranium_prod', '''uranium'', r.uranium_prod::text');
  v_def := replace(v_def, '''total_kr'', v_total', '''total_kr'', v_total::text');
  IF v_def ~ '''coal_prod'', r\.coal_prod([,\)])'
     OR v_def ~ '''coal_upkeep'', v_upkeep([,\)])'
     OR v_def ~ '''oil'', r\.oil_prod([,\)])'
     OR v_def ~ '''copper'', r\.copper_prod([,\)])'
     OR v_def ~ '''iron'', r\.iron_prod([,\)])'
     OR v_def ~ '''uranium'', r\.uranium_prod([,\)])' THEN
    RAISE EXCEPTION 'Nie udało się zachować precyzji danych wypłaty w historii';
  END IF;
  EXECUTE v_def;
  REVOKE ALL ON FUNCTION public.run_daily_economy(date) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.run_daily_economy(date) TO authenticated, service_role;
END;
$economy_details$;

NOTIFY pgrst, 'reload schema';
