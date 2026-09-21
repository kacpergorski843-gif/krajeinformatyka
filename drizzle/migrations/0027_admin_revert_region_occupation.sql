-- UPDATE 4.1: administrator can safely revert an active region occupation.
create or replace function public.admin_revert_region_occupation(p_region_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_role text;
  v_region_country_id uuid;
  v_occupier_country_id uuid;
  v_previous_country_id uuid;
  v_occupied_at timestamptz;
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

  select country_id into v_region_country_id
  from public.regions
  where id = p_region_id
  for update;

  if v_region_country_id is null then
    raise exception 'Nie znaleziono regionu';
  end if;

  select previous_country_id, current_country_id, occupied_at
    into v_previous_country_id, v_occupier_country_id, v_occupied_at
  from public.region_occupations
  where region_id = p_region_id
  order by occupied_at desc
  limit 1;

  if not found or v_previous_country_id = v_occupier_country_id then
    raise exception 'Ten region nie jest obecnie okupowany';
  end if;

  if v_region_country_id <> v_occupier_country_id then
    raise exception 'Stan regionu zmienił się — odśwież panel i spróbuj ponownie';
  end if;

  update public.regions
  set country_id = v_previous_country_id
  where id = p_region_id;

  insert into public.region_occupations(
    region_id,
    previous_country_id,
    current_country_id,
    occupied_at
  )
  values (
    p_region_id,
    v_occupier_country_id,
    v_previous_country_id,
    now()
  );

  insert into public.admin_actions(action, country_id, details, actor_id)
  values(
    'REVERT_REGION_OCCUPATION',
    v_previous_country_id,
    jsonb_build_object(
      'region_id', p_region_id,
      'previous_occupier_country_id', v_occupier_country_id,
      'restored_country_id', v_previous_country_id,
      'original_occupied_at', v_occupied_at,
      'reverted_at', now()
    ),
    auth.uid()
  );

  return jsonb_build_object(
    'ok', true,
    'region_id', p_region_id,
    'restored_country_id', v_previous_country_id,
    'previous_occupier_country_id', v_occupier_country_id
  );
end;
$function$;

grant execute on function public.admin_revert_region_occupation(uuid) to authenticated;

notify pgrst, 'reload schema';
