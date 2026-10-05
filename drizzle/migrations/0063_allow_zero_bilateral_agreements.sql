-- 0063: allow zero-valued bilateral agreements
-- Keep KR restricted to zero or whole billions; zero is a valid value.
CREATE OR REPLACE FUNCTION public.admin_create_bilateral_agreement_v2(
  p_country_a_id uuid,
  p_country_b_id uuid,
  p_a_balance numeric,
  p_a_coal numeric,
  p_a_oil numeric,
  p_a_copper numeric,
  p_a_iron numeric,
  p_a_uranium numeric,
  p_b_balance numeric,
  p_b_coal numeric,
  p_b_oil numeric,
  p_b_copper numeric,
  p_b_iron numeric,
  p_b_uranium numeric,
  p_interval_days integer,
  p_ends_at date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Brak uprawnień'; END IF;
  IF p_country_a_id = p_country_b_id THEN RAISE EXCEPTION 'Państwa muszą być różne'; END IF;
  IF p_a_balance < 0 OR p_a_coal < 0 OR p_a_oil < 0 OR p_a_copper < 0 OR p_a_iron < 0 OR p_a_uranium < 0
     OR p_b_balance < 0 OR p_b_coal < 0 OR p_b_oil < 0 OR p_b_copper < 0 OR p_b_iron < 0 OR p_b_uranium < 0
  THEN RAISE EXCEPTION 'Wartości nie mogą być ujemne'; END IF;
  IF mod(p_a_balance,1000000000)<>0 OR mod(p_b_balance,1000000000)<>0 THEN RAISE EXCEPTION 'KR musi być wielokrotnością 1 mld'; END IF;
  IF p_interval_days < 1 OR p_interval_days > 365 THEN RAISE EXCEPTION 'Nieprawidłowy interwał'; END IF;
  IF p_ends_at < CURRENT_DATE THEN RAISE EXCEPTION 'Data zakończenia nie może być w przeszłości'; END IF;

  INSERT INTO public.bilateral_agreements (
    country_a_id, country_b_id,
    a_balance, a_coal, a_oil, a_copper, a_iron, a_uranium,
    b_balance, b_coal, b_oil, b_copper, b_iron, b_uranium,
    interval_days, ends_at, status, next_run_date
  ) VALUES (
    p_country_a_id, p_country_b_id,
    p_a_balance, p_a_coal, p_a_oil, p_a_copper, p_a_iron, p_a_uranium,
    p_b_balance, p_b_coal, p_b_oil, p_b_copper, p_b_iron, p_b_uranium,
    p_interval_days, p_ends_at, 'ACTIVE', CURRENT_DATE
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_bilateral_agreement_v2(uuid, uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, integer, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_create_bilateral_agreement_v2(uuid, uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, integer, date) TO authenticated, service_role;
