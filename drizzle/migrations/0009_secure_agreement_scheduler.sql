CREATE OR REPLACE FUNCTION public.run_bilateral_agreements(p_run_date date DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_date date := coalesce(p_run_date,(now() AT TIME ZONE 'Europe/Warsaw')::date); v_row public.bilateral_agreements; v_a public.countries; v_b public.countries; v_a_available numeric; v_b_available numeric; v_completed integer := 0; v_skipped integer := 0; v_next date;
BEGIN
 IF session_user <> 'postgres' AND NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Brak uprawnień administratora'; END IF;
 IF v_date > (now() AT TIME ZONE 'Europe/Warsaw')::date OR v_date < (now() AT TIME ZONE 'Europe/Warsaw')::date - 30 THEN RAISE EXCEPTION 'Nieprawidłowa data rozliczenia'; END IF;
 FOR v_row IN SELECT * FROM public.bilateral_agreements WHERE status = 'ACTIVE' AND next_run_date <= v_date ORDER BY next_run_date,id FOR UPDATE SKIP LOCKED LOOP
   IF v_row.ends_at < v_row.next_run_date THEN UPDATE public.bilateral_agreements SET status = 'EXPIRED' WHERE id = v_row.id; CONTINUE; END IF;
   PERFORM 1 FROM public.countries WHERE id = least(v_row.country_a_id,v_row.country_b_id) FOR UPDATE;
   PERFORM 1 FROM public.countries WHERE id = greatest(v_row.country_a_id,v_row.country_b_id) FOR UPDATE;
   SELECT * INTO v_a FROM public.countries WHERE id = v_row.country_a_id;
   SELECT * INTO v_b FROM public.countries WHERE id = v_row.country_b_id;
   v_a_available := CASE v_row.a_resource WHEN 'balance' THEN v_a.balance WHEN 'coal' THEN v_a.coal WHEN 'oil' THEN v_a.oil WHEN 'copper' THEN v_a.copper WHEN 'iron' THEN v_a.iron ELSE v_a.uranium END;
   v_b_available := CASE v_row.b_resource WHEN 'balance' THEN v_b.balance WHEN 'coal' THEN v_b.coal WHEN 'oil' THEN v_b.oil WHEN 'copper' THEN v_b.copper WHEN 'iron' THEN v_b.iron ELSE v_b.uranium END;
   v_next := v_row.next_run_date + v_row.interval_days;
   IF v_a_available < v_row.a_amount OR v_b_available < v_row.b_amount THEN
     INSERT INTO public.bilateral_agreement_runs (agreement_id,run_date,status) VALUES (v_row.id,v_row.next_run_date,'SKIPPED') ON CONFLICT (agreement_id,run_date) DO NOTHING;
     v_skipped := v_skipped + 1;
   ELSE
     EXECUTE format('UPDATE public.countries SET %I = %I - $1 WHERE id = $2',v_row.a_resource,v_row.a_resource) USING v_row.a_amount,v_row.country_a_id;
     EXECUTE format('UPDATE public.countries SET %I = %I - $1 WHERE id = $2',v_row.b_resource,v_row.b_resource) USING v_row.b_amount,v_row.country_b_id;
     EXECUTE format('UPDATE public.countries SET %I = %I + $1 WHERE id = $2',v_row.a_resource,v_row.a_resource) USING v_row.a_amount,v_row.country_b_id;
     EXECUTE format('UPDATE public.countries SET %I = %I + $1 WHERE id = $2',v_row.b_resource,v_row.b_resource) USING v_row.b_amount,v_row.country_a_id;
     INSERT INTO public.transactions (country_id,kind,label,amount_kr,actor_id,details) VALUES
       (v_row.country_a_id,'AGREEMENT','Umowa z ' || v_b.name,CASE WHEN v_row.b_resource='balance' THEN v_row.b_amount ELSE 0 END - CASE WHEN v_row.a_resource='balance' THEN v_row.a_amount ELSE 0 END,NULL,jsonb_build_object('agreement_id',v_row.id,'sent_resource',v_row.a_resource,'sent_amount',v_row.a_amount,'received_resource',v_row.b_resource,'received_amount',v_row.b_amount)),
       (v_row.country_b_id,'AGREEMENT','Umowa z ' || v_a.name,CASE WHEN v_row.a_resource='balance' THEN v_row.a_amount ELSE 0 END - CASE WHEN v_row.b_resource='balance' THEN v_row.b_amount ELSE 0 END,NULL,jsonb_build_object('agreement_id',v_row.id,'sent_resource',v_row.b_resource,'sent_amount',v_row.b_amount,'received_resource',v_row.a_resource,'received_amount',v_row.a_amount));
     INSERT INTO public.bilateral_agreement_runs (agreement_id,run_date,status) VALUES (v_row.id,v_row.next_run_date,'COMPLETED');
     v_completed := v_completed + 1;
   END IF;
   UPDATE public.bilateral_agreements SET next_run_date = v_next,status = CASE WHEN v_next > ends_at THEN 'EXPIRED' ELSE 'ACTIVE' END WHERE id = v_row.id;
 END LOOP;
 RETURN jsonb_build_object('completed',v_completed,'skipped',v_skipped);
END $$;
REVOKE ALL ON FUNCTION public.run_bilateral_agreements(date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.run_bilateral_agreements(date) TO authenticated,service_role;
NOTIFY pgrst, 'reload schema';