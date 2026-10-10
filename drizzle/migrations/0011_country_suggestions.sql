CREATE TABLE public.country_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  note text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACCEPTED','REJECTED')),
  country_id uuid REFERENCES public.countries(id) ON DELETE SET NULL,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX country_suggestions_one_pending ON public.country_suggestions(user_id) WHERE status = 'PENDING';
GRANT SELECT ON public.country_suggestions TO authenticated;
GRANT ALL ON public.country_suggestions TO service_role;
ALTER TABLE public.country_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "suggestions own or admin" ON public.country_suggestions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.suggest_country(p_name text, p_note text DEFAULT '')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Musisz być zalogowany'; END IF;
  IF EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND country_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Masz już przypisane państwo'; END IF;
  IF length(trim(coalesce(p_name,''))) < 2 OR length(trim(p_name)) > 60 THEN
    RAISE EXCEPTION 'Nazwa państwa musi mieć 2–60 znaków'; END IF;
  IF EXISTS (SELECT 1 FROM countries WHERE lower(name) = lower(trim(p_name))) THEN
    RAISE EXCEPTION 'Państwo o tej nazwie już istnieje'; END IF;
  IF EXISTS (SELECT 1 FROM country_suggestions WHERE user_id = auth.uid() AND status = 'PENDING') THEN
    RAISE EXCEPTION 'Masz już oczekującą propozycję'; END IF;
  INSERT INTO country_suggestions(user_id, name, note)
  VALUES (auth.uid(), trim(p_name), left(trim(coalesce(p_note,'')), 500)) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.cancel_country_suggestion(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM country_suggestions WHERE id = p_id AND user_id = auth.uid() AND status = 'PENDING';
END $$;

CREATE OR REPLACE FUNCTION public.admin_review_country_suggestion(p_id uuid, p_accept boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s country_suggestions; v_country uuid;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Brak uprawnień administratora'; END IF;
  SELECT * INTO s FROM country_suggestions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nie znaleziono propozycji'; END IF;
  IF s.status <> 'PENDING' THEN RAISE EXCEPTION 'Propozycja została już rozpatrzona'; END IF;
  IF p_accept THEN
    IF EXISTS (SELECT 1 FROM profiles WHERE id = s.user_id AND country_id IS NOT NULL) THEN
      RAISE EXCEPTION 'Gracz ma już przypisane państwo'; END IF;
    v_country := public.admin_create_country_for_user(s.user_id, s.name, '🏳️');
    UPDATE country_suggestions SET status='ACCEPTED', country_id=v_country, reviewed_by=auth.uid(), reviewed_at=now() WHERE id=p_id;
  ELSE
    UPDATE country_suggestions SET status='REJECTED', reviewed_by=auth.uid(), reviewed_at=now() WHERE id=p_id;
    INSERT INTO admin_actions(actor_id, action, details)
    VALUES (auth.uid(), 'REJECT_COUNTRY_SUGGESTION', jsonb_build_object('name', s.name, 'user_id', s.user_id));
  END IF;
  RETURN jsonb_build_object('ok', true, 'country_id', v_country);
END $$;

REVOKE ALL ON FUNCTION public.suggest_country(text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_country_suggestion(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_review_country_suggestion(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.suggest_country(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_country_suggestion(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_country_suggestion(uuid,boolean) TO authenticated;