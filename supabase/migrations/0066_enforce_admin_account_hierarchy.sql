-- Enforce the documented role hierarchy inside the database, not only in server handlers.
-- Ordinary admins may purge player accounts, but only MAIN_ADMIN may purge an admin account.
CREATE OR REPLACE FUNCTION public.admin_purge_player(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles;
  v_actor_id uuid := auth.uid();
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

  IF v_profile.id IS NULL THEN
    RAISE EXCEPTION 'Nie znaleziono profilu użytkownika';
  END IF;

  IF (
    public.has_role(p_user_id, 'ADMIN')
    OR public.has_role(p_user_id, 'MAIN_ADMIN')
  ) AND NOT public.has_role(v_actor_id, 'MAIN_ADMIN') THEN
    RAISE EXCEPTION 'Tylko główny administrator może usunąć konto administratora';
  END IF;

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

  DELETE FROM public.user_roles WHERE user_id = p_user_id;
  DELETE FROM public.profiles WHERE id = p_user_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_purge_player(uuid) TO authenticated;
