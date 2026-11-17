-- Repair production Arsenal RPCs without replacing their current game rules.
-- Preserve the live missile function body (including test-country protection),
-- but use NUMERIC inventory checks and deterministic country-row lock ordering.

DO $arsenal_missile$
DECLARE
  v_def text;
BEGIN
  v_def := pg_get_functiondef(
    'public.launch_missile(uuid, text, uuid, uuid[], text)'::regprocedure
  );

  v_def := regexp_replace(
    v_def,
    'v_have[[:space:]]+(integer|int)[[:space:]]*;',
    'v_have numeric;',
    'i'
  );

  IF v_def !~* 'v_have[[:space:]]+numeric[[:space:]]*;' THEN
    RAISE EXCEPTION 'Nie udało się poszerzyć v_have w launch_missile';
  END IF;

  -- The production function currently locks attacker then defender, which
  -- can deadlock when two countries attack each other concurrently.
  v_def := regexp_replace(
    v_def,
    'select[[:space:]]+\*[[:space:]]+into[[:space:]]+v_att[[:space:]]+from[[:space:]]+public\.countries[[:space:]]+where[[:space:]]+id[[:space:]]*=[[:space:]]*p_country_id[[:space:]]+for[[:space:]]+update[[:space:]]*;[[:space:]]*select[[:space:]]+\*[[:space:]]+into[[:space:]]+v_def[[:space:]]+from[[:space:]]+public\.countries[[:space:]]+where[[:space:]]+id[[:space:]]*=[[:space:]]*v_region\.country_id[[:space:]]+for[[:space:]]+update[[:space:]]*;',
    'if p_country_id::text < v_region.country_id::text then select * into v_att from public.countries where id = p_country_id for update; select * into v_def from public.countries where id = v_region.country_id for update; else select * into v_def from public.countries where id = v_region.country_id for update; select * into v_att from public.countries where id = p_country_id for update; end if;',
    'i'
  );

  IF v_def ~* 'select[[:space:]]+\*[[:space:]]+into[[:space:]]+v_att[[:space:]]+from[[:space:]]+public\.countries[[:space:]]+where[[:space:]]+id[[:space:]]*=[[:space:]]*p_country_id[[:space:]]+for[[:space:]]+update[[:space:]]*;[[:space:]]*select[[:space:]]+\*[[:space:]]+into[[:space:]]+v_def[[:space:]]+from[[:space:]]+public\.countries[[:space:]]+where[[:space:]]+id[[:space:]]*=[[:space:]]*v_region\.country_id[[:space:]]+for[[:space:]]+update' THEN
    RAISE EXCEPTION 'Nie udało się ustawić deterministycznej kolejności blokad w launch_missile';
  END IF;

  IF v_def !~* 'if[[:space:]]+p_country_id::text[[:space:]]*<[[:space:]]*v_region\.country_id::text' THEN
    RAISE EXCEPTION 'Nie znaleziono ani nie udało się naprawić kolejności blokad w launch_missile';
  END IF;

  EXECUTE v_def;
  REVOKE ALL ON FUNCTION public.launch_missile(uuid, text, uuid, uuid[], text) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.launch_missile(uuid, text, uuid, uuid[], text) TO authenticated, service_role;
END;
$arsenal_missile$;

-- Region OPL is NUMERIC in the live schema. Remove the old INTEGER RPC
-- signature so administrators can set values above the 32-bit limit.
DO $arsenal_region_aa$
DECLARE
  v_def text;
BEGIN
  IF to_regprocedure('public.admin_set_region_aa(uuid, integer)') IS NOT NULL THEN
    v_def := pg_get_functiondef(
      'public.admin_set_region_aa(uuid, integer)'::regprocedure
    );
    v_def := regexp_replace(v_def, 'p_value[[:space:]]+integer', 'p_value numeric', 'i');
    v_def := regexp_replace(
      v_def,
      'if[[:space:]]+p_value[[:space:]]+is[[:space:]]+null[[:space:]]+or[[:space:]]+p_value[[:space:]]*<[[:space:]]*0[[:space:]]+then',
      'if p_value is null or p_value < 0 or p_value <> trunc(p_value) then',
      'i'
    );

    IF v_def !~* 'admin_set_region_aa\(p_region_id uuid, p_value numeric\)' THEN
      RAISE EXCEPTION 'Nie udało się zmienić parametru admin_set_region_aa na NUMERIC';
    END IF;
    IF v_def !~* 'p_value <> trunc\(p_value\)' THEN
      RAISE EXCEPTION 'Nie udało się dodać walidacji całkowitej wartości OPL';
    END IF;

    EXECUTE 'DROP FUNCTION public.admin_set_region_aa(uuid, integer)';
    EXECUTE v_def;
  ELSIF to_regprocedure('public.admin_set_region_aa(uuid, numeric)') IS NULL THEN
    RAISE EXCEPTION 'Brak funkcji admin_set_region_aa';
  END IF;

  REVOKE ALL ON FUNCTION public.admin_set_region_aa(uuid, numeric) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.admin_set_region_aa(uuid, numeric) TO authenticated, service_role;
END;
$arsenal_region_aa$;

-- Existing production data was checked and contains no negative military
-- inventory or regional AA. Enforce that invariant for all future writes too.
DO $arsenal_constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.countries'::regclass
      AND conname = 'countries_military_counts_nonnegative'
  ) THEN
    ALTER TABLE public.countries
      ADD CONSTRAINT countries_military_counts_nonnegative
      CHECK (
        aa_defense >= 0
        AND missile_1 >= 0
        AND missile_2 >= 0
        AND missile_3 >= 0
        AND soldier_packs >= 0
        AND tank_packs >= 0
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.regions'::regclass
      AND conname = 'regions_aa_defense_nonnegative'
  ) THEN
    ALTER TABLE public.regions
      ADD CONSTRAINT regions_aa_defense_nonnegative
      CHECK (aa_defense >= 0) NOT VALID;
  END IF;
END;
$arsenal_constraints$;

ALTER TABLE public.countries
  VALIDATE CONSTRAINT countries_military_counts_nonnegative;
ALTER TABLE public.regions
  VALIDATE CONSTRAINT regions_aa_defense_nonnegative;

NOTIFY pgrst, 'reload schema';
