-- Only MAIN_ADMIN may delete accounts that hold administrative roles.
-- Keep this invariant in the database, not only in the application layer.
create or replace function public.admin_purge_player(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Brak uprawnień administratora';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'Nie można usunąć własnego konta';
  end if;

  if (
    public.has_role(p_user_id, 'ADMIN')
    or public.has_role(p_user_id, 'MAIN_ADMIN')
  ) and not public.has_role(auth.uid(), 'MAIN_ADMIN') then
    raise exception 'Tylko główny administrator może usunąć konto administratora';
  end if;

  select * into v_profile
  from public.profiles
  where id = p_user_id;

  if v_profile.id is null then
    raise exception 'Nie znaleziono profilu użytkownika';
  end if;

  insert into public.admin_actions (actor_id, country_id, action, details)
  values (
    auth.uid(),
    v_profile.country_id,
    'DELETE_PLAYER',
    jsonb_build_object(
      'user_id', p_user_id,
      'display_name', v_profile.display_name
    )
  );

  delete from public.user_roles
  where user_id = p_user_id;

  delete from public.profiles
  where id = p_user_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.admin_purge_player(uuid) from public, anon;
grant execute on function public.admin_purge_player(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
