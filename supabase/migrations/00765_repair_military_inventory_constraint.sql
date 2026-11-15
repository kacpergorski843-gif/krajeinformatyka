-- Repair the military inventory constraint created by migration 00754.
-- The old existence check used a different name, and the old CHECK omitted >= 0.
DO $repair$
DECLARE v_definition text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_definition
  FROM pg_constraint
  WHERE conrelid='public.countries'::regclass
    AND conname='countries_military_counts_whole_nonnegative';

  IF v_definition IS NOT NULL AND (
    v_definition !~ 'aa_defense >= 0' OR v_definition !~ 'missile_1 >= 0'
    OR v_definition !~ 'missile_2 >= 0' OR v_definition !~ 'missile_3 >= 0'
    OR v_definition !~ 'soldier_packs >= 0' OR v_definition !~ 'tank_packs >= 0'
  ) THEN
    ALTER TABLE public.countries DROP CONSTRAINT countries_military_counts_whole_nonnegative;
    v_definition := NULL;
  END IF;

  IF v_definition IS NULL THEN
    ALTER TABLE public.countries ADD CONSTRAINT countries_military_counts_whole_nonnegative
    CHECK (
      aa_defense >= 0 AND aa_defense = trunc(aa_defense)
      AND missile_1 >= 0 AND missile_1 = trunc(missile_1)
      AND missile_2 >= 0 AND missile_2 = trunc(missile_2)
      AND missile_3 >= 0 AND missile_3 = trunc(missile_3)
      AND soldier_packs >= 0 AND soldier_packs = trunc(soldier_packs)
      AND tank_packs >= 0 AND tank_packs = trunc(tank_packs)
    ) NOT VALID;
  END IF;
END;
$repair$;
NOTIFY pgrst, 'reload schema';
