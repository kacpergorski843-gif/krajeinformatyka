-- CREATE AND ASSIGN A NEW COUNTRY TO A PLAYER -----------------------
-- Creates the country and immediately assigns it to the selected player
-- in the same database transaction.

create or replace function public.admin_create_country_for_user(
  p_user_id uuid,
  p_name text,
  p_flag text default '🏳️'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_country_id uuid;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Brak uprawnień administratora';
  end if;

  if p_user_id is null then
    raise exception 'Nie wybrano gracza';
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Nie znaleziono gracza';
  end if;

  if coalesce(trim(p_name), '') = '' then
    raise exception 'Nazwa państwa jest wymagana';
  end if;

  insert into public.countries (name, flag)
  values (trim(p_name), coalesce(nullif(trim(p_flag), ''), '🏳️'))
  returning id into v_country_id;

  update public.profiles
  set country_id = v_country_id
  where id = p_user_id;

  insert into public.admin_actions (actor_id, country_id, action, details)
  values (
    auth.uid(),
    v_country_id,
    'CREATE_AND_ASSIGN_COUNTRY',
    jsonb_build_object(
      'name', trim(p_name),
      'user_id', p_user_id
    )
  );

  return v_country_id;
end;
$$;

grant execute on function public.admin_create_country_for_user(uuid, text, text) to authenticated;
