-- UPDATE 4.0: apply active income bonuses to the existing daily economy.
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
  v_bonus numeric := 0;
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

  SELECT coalesce(max(percent),0) INTO v_bonus
  FROM public.economy_bonuses
  WHERE starts_at <= now() AND ends_at > now();

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

    v_income := floor(v_income * (1 + v_bonus / 100));

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
        'uranium', r.uranium_prod,
        'income_bonus_percent', v_bonus
      )
    );

    v_processed := v_processed + 1;
    v_total := v_total + v_income;
  END LOOP;

  UPDATE public.economy_runs
  SET summary = jsonb_build_object('countries', v_processed, 'total_kr', v_total, 'income_bonus_percent', v_bonus)
  WHERE run_date = p_run_date;

  RETURN jsonb_build_object('ok', true, 'countries', v_processed, 'total_kr', v_total, 'income_bonus_percent', v_bonus);
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_daily_economy(date) TO authenticated;
