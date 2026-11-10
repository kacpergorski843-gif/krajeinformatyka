-- 00746: make account cleanup safely retryable if Supabase Auth deletion
-- fails after the application profile/roles have already been purged.
create or replace function public.admin_purge_player(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_has_profile boolean := false;
  v_target_is_admin boolean := false;
begin
  if v_actor_id is null or not public.is_admin(v_actor_id) then
    raise exception 'Brak uprawnień administratora';
  end if;

  if p_user_id is null then
    raise exception 'Nieprawidłowe konto użytkownika';
  end if;

  if p_user_id = v_actor_id then
    raise exception 'Nie można usunąć własnego konta';
  end if;

  v_target_is_admin :=
    public.has_role(p_user_id, 'ADMIN')
    or public.has_role(p_user_id, 'MAIN_ADMIN');

  if v_target_is_admin and not public.has_role(v_actor_id, 'MAIN_ADMIN') then
    raise exception 'Tylko główny administrator może usunąć konto administratora';
  end if;

  select * into v_profile
  from public.profiles
  where id = p_user_id;
  v_has_profile := found;

  -- The profile may already be gone when retrying after an Auth API failure.
  -- Keep the operation idempotent and still allow the remaining Auth user
  -- to be removed by the server handler.
  if v_has_profile then
    insert into public.admin_actions (actor_id, country_id, action, details)
    values (
      v_actor_id,
      v_profile.country_id,
      'DELETE_PLAYER',
      jsonb_build_object(
        'user_id', p_user_id,
        'display_name', v_profile.display_name,
        'retry_safe', true
      )
    );
  end if;

  delete from public.user_roles where user_id = p_user_id;
  delete from public.profiles where id = p_user_id;

  return jsonb_build_object('ok', true, 'profile_removed', v_has_profile);
end;
$function$;

revoke all on function public.admin_purge_player(uuid) from public, anon;
grant execute on function public.admin_purge_player(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
