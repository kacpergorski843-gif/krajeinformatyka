-- Make player cleanup safe to retry when the Auth Admin deletion fails.
-- The Auth user may still exist after the profile and game data were purged.
CREATE OR REPLACE FUNCTION public.admin_purge_player(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_profile public.profiles%ROWTYPE;
  v_profile_found boolean := false;
BEGIN
  IF v_actor_id IS NULL OR NOT public.is_admin(v_actor_id) THEN
    RAISE EXCEPTION 'Brak uprawnień administratora';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Nieprawidłowe konto użytkownika';
  END IF;

  IF p_user_id = v_actor_id THEN
    RAISE EXCEPTION 'Nie można usunąć własnego konta';
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = p_user_id;
  v_profile_found := FOUND;

  IF (
    public.has_role(p_user_id, 'ADMIN')
    OR public.has_role(p_user_id, 'MAIN_ADMIN')
  ) AND NOT public.has_role(v_actor_id, 'MAIN_ADMIN') THEN
    RAISE EXCEPTION 'Tylko główny administrator może usunąć konto administratora';
  END IF;

  -- Log only when there is still a profile to describe. A missing profile
  -- means a previous attempt already purged game data; continue idempotently.
  IF v_profile_found THEN
    INSERT INTO public.admin_actions (actor_id, country_id, action, details)
    VALUES (
      v_actor_id,
      v_profile.country_id,
      'DELETE_PLAYER',
      jsonb_build_object(
        'user_id', p_user_id,
        'display_name', v_profile.display_name
      )
    );
  END IF;

  DELETE FROM public.user_roles WHERE user_id = p_user_id;
  DELETE FROM public.profiles WHERE id = p_user_id;

  RETURN jsonb_build_object('ok', true, 'profile_found', v_profile_found);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_purge_player(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_purge_player(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
