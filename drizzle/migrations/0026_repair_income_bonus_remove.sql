-- Repair: ensure the admin income-bonus removal RPC exists with the exact
-- named argument expected by Supabase/PostgREST.
create or replace function public.admin_remove_income_bonus(p_bonus_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_role text;
  v_country_id uuid;
  v_percent numeric;
begin
  select role::text into v_role
  from public.user_roles
  where user_id = auth.uid()
    and role in ('ADMIN','MAIN_ADMIN')
  order by role desc
  limit 1;

  if v_role is null then
    raise exception 'Brak uprawnień administratora';
  end if;

  select country_id, percent
  into v_country_id, v_percent
  from public.economy_bonuses
  where id = p_bonus_id
  for update;

  if not found then
    raise exception 'Nie znaleziono bonusu';
  end if;

  update public.economy_bonuses
  set ends_at = least(ends_at, now())
  where id = p_bonus_id;

  insert into public.admin_actions(action, country_id, details, actor_id)
  values (
    'REMOVE_INCOME_BONUS',
    v_country_id,
    jsonb_build_object(
      'bonus_id', p_bonus_id,
      'percent', v_percent
    ),
    auth.uid()
  );

  return jsonb_build_object('ok', true);
end;
$function$;

grant execute on function public.admin_remove_income_bonus(uuid) to authenticated;

notify pgrst, 'reload schema';
