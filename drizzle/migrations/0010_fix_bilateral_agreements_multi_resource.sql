CREATE OR REPLACE FUNCTION public.run_bilateral_agreements(p_run_date date DEFAULT NULL::date)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_date date := coalesce(p_run_date,(now() AT TIME ZONE 'Europe/Warsaw')::date);
 v_row public.bilateral_agreements; v_a public.countries; v_b public.countries;
 v_completed integer := 0; v_skipped integer := 0; v_run date;
 a_bal numeric; a_coal numeric; a_oil numeric; a_cop numeric; a_iron numeric; a_ur numeric;
 b_bal numeric; b_coal numeric; b_oil numeric; b_cop numeric; b_iron numeric; b_ur numeric;
BEGIN
 IF session_user <> 'postgres' AND NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Brak uprawnień administratora'; END IF;
 IF v_date > (now() AT TIME ZONE 'Europe/Warsaw')::date OR v_date < (now() AT TIME ZONE 'Europe/Warsaw')::date - 30 THEN RAISE EXCEPTION 'Nieprawidłowa data rozliczenia'; END IF;
 FOR v_row IN SELECT * FROM public.bilateral_agreements WHERE status='ACTIVE' AND next_run_date <= v_date ORDER BY next_run_date,id FOR UPDATE SKIP LOCKED LOOP
  a_bal := v_row.a_balance + CASE WHEN v_row.a_resource='balance' THEN coalesce(v_row.a_amount,0) ELSE 0 END;
  a_coal := v_row.a_coal + CASE WHEN v_row.a_resource='coal' THEN coalesce(v_row.a_amount,0) ELSE 0 END;
  a_oil := v_row.a_oil + CASE WHEN v_row.a_resource='oil' THEN coalesce(v_row.a_amount,0) ELSE 0 END;
  a_cop := v_row.a_copper + CASE WHEN v_row.a_resource='copper' THEN coalesce(v_row.a_amount,0) ELSE 0 END;
  a_iron := v_row.a_iron + CASE WHEN v_row.a_resource='iron' THEN coalesce(v_row.a_amount,0) ELSE 0 END;
  a_ur := v_row.a_uranium + CASE WHEN v_row.a_resource='uranium' THEN coalesce(v_row.a_amount,0) ELSE 0 END;
  b_bal := v_row.b_balance + CASE WHEN v_row.b_resource='balance' THEN coalesce(v_row.b_amount,0) ELSE 0 END;
  b_coal := v_row.b_coal + CASE WHEN v_row.b_resource='coal' THEN coalesce(v_row.b_amount,0) ELSE 0 END;
  b_oil := v_row.b_oil + CASE WHEN v_row.b_resource='oil' THEN coalesce(v_row.b_amount,0) ELSE 0 END;
  b_cop := v_row.b_copper + CASE WHEN v_row.b_resource='copper' THEN coalesce(v_row.b_amount,0) ELSE 0 END;
  b_iron := v_row.b_iron + CASE WHEN v_row.b_resource='iron' THEN coalesce(v_row.b_amount,0) ELSE 0 END;
  b_ur := v_row.b_uranium + CASE WHEN v_row.b_resource='uranium' THEN coalesce(v_row.b_amount,0) ELSE 0 END;
  v_run := v_row.next_run_date;
  WHILE v_run <= v_date AND v_run <= v_row.ends_at LOOP
   PERFORM 1 FROM public.countries WHERE id = least(v_row.country_a_id,v_row.country_b_id) FOR UPDATE;
   PERFORM 1 FROM public.countries WHERE id = greatest(v_row.country_a_id,v_row.country_b_id) FOR UPDATE;
   SELECT * INTO v_a FROM public.countries WHERE id=v_row.country_a_id;
   SELECT * INTO v_b FROM public.countries WHERE id=v_row.country_b_id;
   IF v_a.id IS NULL OR v_b.id IS NULL THEN EXIT; END IF;
   IF v_a.balance<a_bal OR v_a.coal<a_coal OR v_a.oil<a_oil OR v_a.copper<a_cop OR v_a.iron<a_iron OR v_a.uranium<a_ur
    OR v_b.balance<b_bal OR v_b.coal<b_coal OR v_b.oil<b_oil OR v_b.copper<b_cop OR v_b.iron<b_iron OR v_b.uranium<b_ur THEN
     INSERT INTO public.bilateral_agreement_runs(agreement_id,run_date,status) VALUES(v_row.id,v_run,'SKIPPED') ON CONFLICT (agreement_id,run_date) DO NOTHING;
     v_skipped := v_skipped+1;
   ELSE
     UPDATE public.countries SET balance=balance-a_bal+b_bal, coal=coal-a_coal+b_coal, oil=oil-a_oil+b_oil, copper=copper-a_cop+b_cop, iron=iron-a_iron+b_iron, uranium=uranium-a_ur+b_ur WHERE id=v_row.country_a_id;
     UPDATE public.countries SET balance=balance-b_bal+a_bal, coal=coal-b_coal+a_coal, oil=oil-b_oil+a_oil, copper=copper-b_cop+a_cop, iron=iron-b_iron+a_iron, uranium=uranium-b_ur+a_ur WHERE id=v_row.country_b_id;
     INSERT INTO public.transactions(country_id,kind,label,amount_kr,actor_id,details) VALUES
      (v_row.country_a_id,'AGREEMENT','Umowa z '||v_b.name,b_bal-a_bal,NULL,jsonb_build_object('agreement_id',v_row.id,'run_date',v_run,'sent',jsonb_build_object('balance',a_bal,'coal',a_coal,'oil',a_oil,'copper',a_cop,'iron',a_iron,'uranium',a_ur),'received',jsonb_build_object('balance',b_bal,'coal',b_coal,'oil',b_oil,'copper',b_cop,'iron',b_iron,'uranium',b_ur))),
      (v_row.country_b_id,'AGREEMENT','Umowa z '||v_a.name,a_bal-b_bal,NULL,jsonb_build_object('agreement_id',v_row.id,'run_date',v_run,'sent',jsonb_build_object('balance',b_bal,'coal',b_coal,'oil',b_oil,'copper',b_cop,'iron',b_iron,'uranium',b_ur),'received',jsonb_build_object('balance',a_bal,'coal',a_coal,'oil',a_oil,'copper',a_cop,'iron',a_iron,'uranium',a_ur)));
     INSERT INTO public.bilateral_agreement_runs(agreement_id,run_date,status) VALUES(v_row.id,v_run,'COMPLETED') ON CONFLICT (agreement_id,run_date) DO NOTHING;
     v_completed := v_completed+1;
   END IF;
   v_run := v_run + v_row.interval_days;
  END LOOP;
  UPDATE public.bilateral_agreements SET next_run_date=v_run, status=CASE WHEN v_run>ends_at THEN 'EXPIRED' ELSE 'ACTIVE' END WHERE id=v_row.id;
 END LOOP;
 RETURN jsonb_build_object('completed',v_completed,'skipped',v_skipped);
END $function$;
REVOKE ALL ON FUNCTION public.run_bilateral_agreements(date) FROM PUBLIC, anon;