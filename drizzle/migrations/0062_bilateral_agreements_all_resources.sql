-- 0062: each agreement can contain KR and every resource independently; individual values may be zero.
ALTER TABLE public.bilateral_agreements
  ADD COLUMN IF NOT EXISTS a_balance numeric NOT NULL DEFAULT 0 CHECK (a_balance >= 0),
  ADD COLUMN IF NOT EXISTS a_coal numeric NOT NULL DEFAULT 0 CHECK (a_coal >= 0),
  ADD COLUMN IF NOT EXISTS a_oil numeric NOT NULL DEFAULT 0 CHECK (a_oil >= 0),
  ADD COLUMN IF NOT EXISTS a_copper numeric NOT NULL DEFAULT 0 CHECK (a_copper >= 0),
  ADD COLUMN IF NOT EXISTS a_iron numeric NOT NULL DEFAULT 0 CHECK (a_iron >= 0),
  ADD COLUMN IF NOT EXISTS a_uranium numeric NOT NULL DEFAULT 0 CHECK (a_uranium >= 0),
  ADD COLUMN IF NOT EXISTS b_balance numeric NOT NULL DEFAULT 0 CHECK (b_balance >= 0),
  ADD COLUMN IF NOT EXISTS b_coal numeric NOT NULL DEFAULT 0 CHECK (b_coal >= 0),
  ADD COLUMN IF NOT EXISTS b_oil numeric NOT NULL DEFAULT 0 CHECK (b_oil >= 0),
  ADD COLUMN IF NOT EXISTS b_copper numeric NOT NULL DEFAULT 0 CHECK (b_copper >= 0),
  ADD COLUMN IF NOT EXISTS b_iron numeric NOT NULL DEFAULT 0 CHECK (b_iron >= 0),
  ADD COLUMN IF NOT EXISTS b_uranium numeric NOT NULL DEFAULT 0 CHECK (b_uranium >= 0);

UPDATE public.bilateral_agreements
SET
  a_balance=CASE WHEN a_resource='balance' THEN a_amount ELSE 0 END,
  a_coal=CASE WHEN a_resource='coal' THEN a_amount ELSE 0 END,
  a_oil=CASE WHEN a_resource='oil' THEN a_amount ELSE 0 END,
  a_copper=CASE WHEN a_resource='copper' THEN a_amount ELSE 0 END,
  a_iron=CASE WHEN a_resource='iron' THEN a_amount ELSE 0 END,
  a_uranium=CASE WHEN a_resource='uranium' THEN a_amount ELSE 0 END,
  b_balance=CASE WHEN b_resource='balance' THEN b_amount ELSE 0 END,
  b_coal=CASE WHEN b_resource='coal' THEN b_amount ELSE 0 END,
  b_oil=CASE WHEN b_resource='oil' THEN b_amount ELSE 0 END,
  b_copper=CASE WHEN b_resource='copper' THEN b_amount ELSE 0 END,
  b_iron=CASE WHEN b_resource='iron' THEN b_amount ELSE 0 END,
  b_uranium=CASE WHEN b_resource='uranium' THEN b_amount ELSE 0 END
WHERE a_balance=0 AND a_coal=0 AND a_oil=0 AND a_copper=0 AND a_iron=0 AND a_uranium=0
  AND b_balance=0 AND b_coal=0 AND b_oil=0 AND b_copper=0 AND b_iron=0 AND b_uranium=0;

ALTER TABLE public.bilateral_agreements
  ALTER COLUMN a_resource DROP NOT NULL,
  ALTER COLUMN a_amount DROP NOT NULL,
  ALTER COLUMN b_resource DROP NOT NULL,
  ALTER COLUMN b_amount DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.admin_create_bilateral_agreement_v2(
  p_country_a_id uuid,p_country_b_id uuid,
  p_a_balance numeric,p_a_coal numeric,p_a_oil numeric,p_a_copper numeric,p_a_iron numeric,p_a_uranium numeric,
  p_b_balance numeric,p_b_coal numeric,p_b_oil numeric,p_b_copper numeric,p_b_iron numeric,p_b_uranium numeric,
  p_interval_days integer,p_ends_at date
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid; v_today date := (now() AT TIME ZONE 'Europe/Warsaw')::date;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Brak uprawnień administratora'; END IF;
  IF p_country_a_id IS NULL OR p_country_b_id IS NULL OR p_country_a_id=p_country_b_id THEN RAISE EXCEPTION 'Wybierz dwa różne państwa'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.countries WHERE id=p_country_a_id) OR NOT EXISTS (SELECT 1 FROM public.countries WHERE id=p_country_b_id) THEN RAISE EXCEPTION 'Nie znaleziono państwa'; END IF;
  IF p_a_balance IS NULL OR p_a_coal IS NULL OR p_a_oil IS NULL OR p_a_copper IS NULL OR p_a_iron IS NULL OR p_a_uranium IS NULL
     OR p_b_balance IS NULL OR p_b_coal IS NULL OR p_b_oil IS NULL OR p_b_copper IS NULL OR p_b_iron IS NULL OR p_b_uranium IS NULL THEN RAISE EXCEPTION 'Podaj wartości dla wszystkich zasobów'; END IF;
  IF p_a_balance<0 OR p_a_coal<0 OR p_a_oil<0 OR p_a_copper<0 OR p_a_iron<0 OR p_a_uranium<0
     OR p_b_balance<0 OR p_b_coal<0 OR p_b_oil<0 OR p_b_copper<0 OR p_b_iron<0 OR p_b_uranium<0 THEN RAISE EXCEPTION 'Wartości nie mogą być ujemne'; END IF;
  IF (p_a_balance=0 AND p_a_coal=0 AND p_a_oil=0 AND p_a_copper=0 AND p_a_iron=0 AND p_a_uranium=0)
     OR (p_b_balance=0 AND p_b_coal=0 AND p_b_oil=0 AND p_b_copper=0 AND p_b_iron=0 AND p_b_uranium=0) THEN RAISE EXCEPTION 'Każda strona musi wysyłać co najmniej jeden zasób'; END IF;
  IF mod(p_a_balance,1000000000)<>0 OR mod(p_b_balance,1000000000)<>0 THEN RAISE EXCEPTION 'KR musi być wielokrotnością 1 mld'; END IF;
  IF p_interval_days IS NULL OR p_interval_days NOT BETWEEN 1 AND 365 THEN RAISE EXCEPTION 'Okres musi wynosić od 1 do 365 dni'; END IF;
  IF p_ends_at IS NULL OR p_ends_at<v_today THEN RAISE EXCEPTION 'Wybierz datę końca nie wcześniejszą niż dziś'; END IF;

  INSERT INTO public.bilateral_agreements (
    country_a_id,country_b_id,a_resource,a_amount,b_resource,b_amount,
    a_balance,a_coal,a_oil,a_copper,a_iron,a_uranium,
    b_balance,b_coal,b_oil,b_copper,b_iron,b_uranium,
    interval_days,next_run_date,ends_at,created_by
  ) VALUES (
    p_country_a_id,p_country_b_id,NULL,NULL,NULL,NULL,
    p_a_balance,p_a_coal,p_a_oil,p_a_copper,p_a_iron,p_a_uranium,
    p_b_balance,p_b_coal,p_b_oil,p_b_copper,p_b_iron,p_b_uranium,
    p_interval_days,v_today,p_ends_at,auth.uid()
  ) RETURNING id INTO v_id;

  INSERT INTO public.admin_actions(actor_id,country_id,action,details)
  VALUES (auth.uid(),p_country_a_id,'CREATE_AGREEMENT',
    jsonb_build_object('agreement_id',v_id,'country_b_id',p_country_b_id,
      'a_amounts',jsonb_build_object('balance',p_a_balance,'coal',p_a_coal,'oil',p_a_oil,'copper',p_a_copper,'iron',p_a_iron,'uranium',p_a_uranium),
      'b_amounts',jsonb_build_object('balance',p_b_balance,'coal',p_b_coal,'oil',p_b_oil,'copper',p_b_copper,'iron',p_b_iron,'uranium',p_b_uranium)));
  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.admin_create_bilateral_agreement_v2(uuid,uuid,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,integer,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_create_bilateral_agreement_v2(uuid,uuid,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,integer,date) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.run_bilateral_agreements(p_run_date date DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_date date:=coalesce(p_run_date,(now() AT TIME ZONE 'Europe/Warsaw')::date);
  v_row public.bilateral_agreements; v_a public.countries; v_b public.countries; v_next date;
  ab numeric; ac numeric; ao numeric; acu numeric; ai numeric; au numeric;
  bb numeric; bc numeric; bo numeric; bcu numeric; bi numeric; bu numeric;
  done_count integer:=0; skip_count integer:=0;
BEGIN
  IF session_user<>'postgres' AND NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Brak uprawnień administratora'; END IF;
  IF v_date>(now() AT TIME ZONE 'Europe/Warsaw')::date OR v_date<(now() AT TIME ZONE 'Europe/Warsaw')::date-30 THEN RAISE EXCEPTION 'Nieprawidłowa data rozliczenia'; END IF;

  FOR v_row IN SELECT * FROM public.bilateral_agreements WHERE status='ACTIVE' AND next_run_date<=v_date ORDER BY next_run_date,id FOR UPDATE SKIP LOCKED LOOP
    IF v_row.ends_at<v_row.next_run_date THEN UPDATE public.bilateral_agreements SET status='EXPIRED' WHERE id=v_row.id; CONTINUE; END IF;
    PERFORM 1 FROM public.countries WHERE id=least(v_row.country_a_id,v_row.country_b_id) FOR UPDATE;
    PERFORM 1 FROM public.countries WHERE id=greatest(v_row.country_a_id,v_row.country_b_id) FOR UPDATE;
    SELECT * INTO v_a FROM public.countries WHERE id=v_row.country_a_id;
    SELECT * INTO v_b FROM public.countries WHERE id=v_row.country_b_id;

    IF v_row.a_resource IS NOT NULL THEN
      ab:=CASE WHEN v_row.a_resource='balance' THEN v_row.a_amount ELSE 0 END; ac:=CASE WHEN v_row.a_resource='coal' THEN v_row.a_amount ELSE 0 END;
      ao:=CASE WHEN v_row.a_resource='oil' THEN v_row.a_amount ELSE 0 END; acu:=CASE WHEN v_row.a_resource='copper' THEN v_row.a_amount ELSE 0 END;
      ai:=CASE WHEN v_row.a_resource='iron' THEN v_row.a_amount ELSE 0 END; au:=CASE WHEN v_row.a_resource='uranium' THEN v_row.a_amount ELSE 0 END;
      bb:=CASE WHEN v_row.b_resource='balance' THEN v_row.b_amount ELSE 0 END; bc:=CASE WHEN v_row.b_resource='coal' THEN v_row.b_amount ELSE 0 END;
      bo:=CASE WHEN v_row.b_resource='oil' THEN v_row.b_amount ELSE 0 END; bcu:=CASE WHEN v_row.b_resource='copper' THEN v_row.b_amount ELSE 0 END;
      bi:=CASE WHEN v_row.b_resource='iron' THEN v_row.b_amount ELSE 0 END; bu:=CASE WHEN v_row.b_resource='uranium' THEN v_row.b_amount ELSE 0 END;
    ELSE
      ab:=v_row.a_balance; ac:=v_row.a_coal; ao:=v_row.a_oil; acu:=v_row.a_copper; ai:=v_row.a_iron; au:=v_row.a_uranium;
      bb:=v_row.b_balance; bc:=v_row.b_coal; bo:=v_row.b_oil; bcu:=v_row.b_copper; bi:=v_row.b_iron; bu:=v_row.b_uranium;
    END IF;

    IF v_a.balance<ab OR v_a.coal<ac OR v_a.oil<ao OR v_a.copper<acu OR v_a.iron<ai OR v_a.uranium<au
       OR v_b.balance<bb OR v_b.coal<bc OR v_b.oil<bo OR v_b.copper<bcu OR v_b.iron<bi OR v_b.uranium<bu THEN
      INSERT INTO public.bilateral_agreement_runs(agreement_id,run_date,status) VALUES(v_row.id,v_row.next_run_date,'SKIPPED') ON CONFLICT DO NOTHING;
      skip_count:=skip_count+1;
    ELSE
      UPDATE public.countries SET balance=balance-ab+bb,coal=coal-ac+bc,oil=oil-ao+bo,copper=copper-acu+bcu,iron=iron-ai+bi,uranium=uranium-au+bu WHERE id=v_row.country_a_id;
      UPDATE public.countries SET balance=balance-bb+ab,coal=coal-bc+ac,oil=oil-bo+ao,copper=copper-bcu+acu,iron=iron-bi+ai,uranium=uranium-bu+au WHERE id=v_row.country_b_id;
      INSERT INTO public.transactions(country_id,kind,label,amount_kr,actor_id,details) VALUES
        (v_row.country_a_id,'AGREEMENT','Umowa z '||v_b.name,bb-ab,NULL,jsonb_build_object('agreement_id',v_row.id,'sent',jsonb_build_object('balance',ab,'coal',ac,'oil',ao,'copper',acu,'iron',ai,'uranium',au),'received',jsonb_build_object('balance',bb,'coal',bc,'oil',bo,'copper',bcu,'iron',bi,'uranium',bu))),
        (v_row.country_b_id,'AGREEMENT','Umowa z '||v_a.name,ab-bb,NULL,jsonb_build_object('agreement_id',v_row.id,'sent',jsonb_build_object('balance',bb,'coal',bc,'oil',bo,'copper',bcu,'iron',bi,'uranium',bu),'received',jsonb_build_object('balance',ab,'coal',ac,'oil',ao,'copper',acu,'iron',ai,'uranium',au)));
      INSERT INTO public.bilateral_agreement_runs(agreement_id,run_date,status) VALUES(v_row.id,v_row.next_run_date,'COMPLETED');
      done_count:=done_count+1;
    END IF;
    v_next:=v_row.next_run_date+v_row.interval_days;
    UPDATE public.bilateral_agreements SET next_run_date=v_next,status=CASE WHEN v_next>ends_at THEN 'EXPIRED' ELSE 'ACTIVE' END WHERE id=v_row.id;
  END LOOP;
  RETURN jsonb_build_object('completed',done_count,'skipped',skip_count);
END $$;

REVOKE ALL ON FUNCTION public.run_bilateral_agreements(date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.run_bilateral_agreements(date) TO authenticated,service_role;
NOTIFY pgrst,'reload schema';