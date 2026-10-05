CREATE TABLE public.bilateral_agreements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 country_a_id uuid NOT NULL REFERENCES public.countries(id) ON DELETE CASCADE,
 country_b_id uuid NOT NULL REFERENCES public.countries(id) ON DELETE CASCADE,
 a_resource text NOT NULL CHECK (a_resource IN ('balance','coal','oil','copper','iron','uranium')),
 a_amount numeric NOT NULL CHECK (a_amount > 0),
 b_resource text NOT NULL CHECK (b_resource IN ('balance','coal','oil','copper','iron','uranium')),
 b_amount numeric NOT NULL CHECK (b_amount > 0),
 interval_days integer NOT NULL CHECK (interval_days BETWEEN 1 AND 365),
 next_run_date date NOT NULL,
 ends_at date NOT NULL,
 status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','CANCELLED','EXPIRED')),
 created_by uuid,
 cancelled_by uuid,
 cancelled_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT different_parties CHECK (country_a_id <> country_b_id)
);
GRANT SELECT ON public.bilateral_agreements TO authenticated;
GRANT ALL ON public.bilateral_agreements TO service_role;
ALTER TABLE public.bilateral_agreements ENABLE ROW LEVEL SECURITY;
CREATE POLICY agreements_read ON public.bilateral_agreements FOR SELECT TO authenticated USING (public.is_admin(auth.uid()) OR country_a_id = public.my_country_id() OR country_b_id = public.my_country_id());
CREATE INDEX bilateral_agreements_due_idx ON public.bilateral_agreements (next_run_date) WHERE status = 'ACTIVE';
CREATE TABLE public.bilateral_agreement_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 agreement_id uuid NOT NULL REFERENCES public.bilateral_agreements(id) ON DELETE CASCADE,
 run_date date NOT NULL,
 status text NOT NULL CHECK (status IN ('COMPLETED','SKIPPED')),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (agreement_id, run_date)
);
GRANT SELECT ON public.bilateral_agreement_runs TO authenticated;
GRANT ALL ON public.bilateral_agreement_runs TO service_role;
ALTER TABLE public.bilateral_agreement_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY agreement_runs_read ON public.bilateral_agreement_runs FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.bilateral_agreements a WHERE a.id = agreement_id AND (public.is_admin(auth.uid()) OR a.country_a_id = public.my_country_id() OR a.country_b_id = public.my_country_id())));
CREATE OR REPLACE FUNCTION public.admin_create_bilateral_agreement(p_country_a_id uuid, p_country_b_id uuid, p_a_resource text, p_a_amount numeric, p_b_resource text, p_b_amount numeric, p_interval_days integer, p_ends_at date) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_today date := (now() AT TIME ZONE 'Europe/Warsaw')::date;
BEGIN
 IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Brak uprawnień administratora'; END IF;
 IF p_country_a_id IS NULL OR p_country_b_id IS NULL OR p_country_a_id = p_country_b_id THEN RAISE EXCEPTION 'Wybierz dwa różne państwa'; END IF;
 IF p_a_resource NOT IN ('balance','coal','oil','copper','iron','uranium') OR p_b_resource NOT IN ('balance','coal','oil','copper','iron','uranium') THEN RAISE EXCEPTION 'Nieobsługiwany zasób'; END IF;
 IF p_a_amount IS NULL OR p_b_amount IS NULL OR p_a_amount <= 0 OR p_b_amount <= 0 OR p_interval_days IS NULL OR p_interval_days NOT BETWEEN 1 AND 365 THEN RAISE EXCEPTION 'Podaj poprawne ilości i okres'; END IF;
 IF (p_a_resource = 'balance' AND (p_a_amount < 1000000000 OR mod(p_a_amount,1000000000) <> 0)) OR (p_b_resource = 'balance' AND (p_b_amount < 1000000000 OR mod(p_b_amount,1000000000) <> 0)) THEN RAISE EXCEPTION 'KR musi być wielokrotnością 1 mld'; END IF;
 IF p_ends_at IS NULL OR p_ends_at < v_today THEN RAISE EXCEPTION 'Wybierz datę końca nie wcześniejszą niż dziś'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.countries WHERE id = p_country_a_id) OR NOT EXISTS (SELECT 1 FROM public.countries WHERE id = p_country_b_id) THEN RAISE EXCEPTION 'Nie znaleziono państwa'; END IF;
 INSERT INTO public.bilateral_agreements (country_a_id,country_b_id,a_resource,a_amount,b_resource,b_amount,interval_days,next_run_date,ends_at,created_by)
 VALUES (p_country_a_id,p_country_b_id,p_a_resource,p_a_amount,p_b_resource,p_b_amount,p_interval_days,v_today,p_ends_at,auth.uid()) RETURNING id INTO v_id;
 INSERT INTO public.admin_actions (actor_id,country_id,action,details) VALUES (auth.uid(),p_country_a_id,'CREATE_AGREEMENT',jsonb_build_object('agreement_id',v_id,'country_b_id',p_country_b_id));
 RETURN v_id;
END $$;
CREATE OR REPLACE FUNCTION public.admin_cancel_bilateral_agreement(p_agreement_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_agreement public.bilateral_agreements;
BEGIN
 IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Brak uprawnień administratora'; END IF;
 SELECT * INTO v_agreement FROM public.bilateral_agreements WHERE id = p_agreement_id FOR UPDATE;
 IF v_agreement.id IS NULL THEN RAISE EXCEPTION 'Nie znaleziono umowy'; END IF;
 IF v_agreement.status <> 'ACTIVE' THEN RAISE EXCEPTION 'Umowa nie jest aktywna'; END IF;
 UPDATE public.bilateral_agreements SET status = 'CANCELLED',cancelled_by = auth.uid(),cancelled_at = now() WHERE id = p_agreement_id;
 INSERT INTO public.admin_actions (actor_id,country_id,action,details) VALUES (auth.uid(),v_agreement.country_a_id,'CANCEL_AGREEMENT',jsonb_build_object('agreement_id',p_agreement_id,'country_b_id',v_agreement.country_b_id));
 RETURN jsonb_build_object('ok',true);
END $$;
CREATE OR REPLACE FUNCTION public.run_bilateral_agreements(p_run_date date DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_date date := coalesce(p_run_date,(now() AT TIME ZONE 'Europe/Warsaw')::date); v_row public.bilateral_agreements; v_a public.countries; v_b public.countries; v_a_available numeric; v_b_available numeric; v_completed integer := 0; v_skipped integer := 0; v_next date; v_a_name text; v_b_name text;
BEGIN
 IF NOT public.is_admin(auth.uid()) AND current_user <> 'postgres' THEN RAISE EXCEPTION 'Brak uprawnień administratora'; END IF;
 IF v_date > (now() AT TIME ZONE 'Europe/Warsaw')::date OR v_date < (now() AT TIME ZONE 'Europe/Warsaw')::date - 30 THEN RAISE EXCEPTION 'Nieprawidłowa data rozliczenia'; END IF;
 FOR v_row IN SELECT * FROM public.bilateral_agreements WHERE status = 'ACTIVE' AND next_run_date <= v_date ORDER BY next_run_date,id FOR UPDATE SKIP LOCKED LOOP
   IF v_row.ends_at < v_row.next_run_date THEN
     UPDATE public.bilateral_agreements SET status = 'EXPIRED' WHERE id = v_row.id;
     CONTINUE;
   END IF;
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
     v_a_name := v_a.name; v_b_name := v_b.name;
     INSERT INTO public.transactions (country_id,kind,label,amount_kr,actor_id,details) VALUES
       (v_row.country_a_id,'AGREEMENT','Umowa z ' || v_b_name,CASE WHEN v_row.b_resource='balance' THEN v_row.b_amount ELSE 0 END - CASE WHEN v_row.a_resource='balance' THEN v_row.a_amount ELSE 0 END,NULL,jsonb_build_object('agreement_id',v_row.id,'sent_resource',v_row.a_resource,'sent_amount',v_row.a_amount,'received_resource',v_row.b_resource,'received_amount',v_row.b_amount)),
       (v_row.country_b_id,'AGREEMENT','Umowa z ' || v_a_name,CASE WHEN v_row.a_resource='balance' THEN v_row.a_amount ELSE 0 END - CASE WHEN v_row.b_resource='balance' THEN v_row.b_amount ELSE 0 END,NULL,jsonb_build_object('agreement_id',v_row.id,'sent_resource',v_row.b_resource,'sent_amount',v_row.b_amount,'received_resource',v_row.a_resource,'received_amount',v_row.a_amount));
     INSERT INTO public.bilateral_agreement_runs (agreement_id,run_date,status) VALUES (v_row.id,v_row.next_run_date,'COMPLETED');
     v_completed := v_completed + 1;
   END IF;
   UPDATE public.bilateral_agreements SET next_run_date = v_next,status = CASE WHEN v_next > ends_at THEN 'EXPIRED' ELSE 'ACTIVE' END WHERE id = v_row.id;
 END LOOP;
 RETURN jsonb_build_object('completed',v_completed,'skipped',v_skipped);
END $$;
REVOKE ALL ON FUNCTION public.admin_create_bilateral_agreement(uuid,uuid,text,numeric,text,numeric,integer,date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_cancel_bilateral_agreement(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.run_bilateral_agreements(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_bilateral_agreement(uuid,uuid,text,numeric,text,numeric,integer,date) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_cancel_bilateral_agreement(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.run_bilateral_agreements(date) TO authenticated,service_role;
SELECT cron.schedule('bilateral-agreements-warsaw-20','2 * * * *',$job$SELECT public.run_bilateral_agreements() WHERE extract(hour FROM (now() AT TIME ZONE 'Europe/Warsaw')) = 20;$job$);
NOTIFY pgrst, 'reload schema';