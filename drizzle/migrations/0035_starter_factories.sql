-- 0035 STARTER FACTORIES
-- Every country starts with three level-1 factories.
-- Factories are placed in existing free regional slots; if a country has no
-- region yet, a starter "Stolica" region is created. Region/building IDs are
-- preserved and no existing building is replaced.

create or replace function public.grant_starter_factories(p_country_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_factory_count integer;
  v_region_id uuid;
  v_slot smallint;
  v_new_region_no integer;
begin
  if p_country_id is null then
    raise exception 'Nie wybrano państwa';
  end if;

  select count(*)
    into v_factory_count
  from public.region_slots s
  join public.regions r on r.id = s.region_id
  where r.country_id = p_country_id
    and s.building = 'factory_1';

  while v_factory_count < 3 loop
    v_region_id := null;
    v_slot := null;

    select r.id, gs.slot_index::smallint
      into v_region_id, v_slot
    from public.regions r
    cross join lateral generate_series(1, 9) as gs(slot_index)
    where r.country_id = p_country_id
      and not exists (
        select 1
        from public.region_slots s
        where s.region_id = r.id
          and s.slot_index = gs.slot_index
      )
    order by r.created_at, r.id, gs.slot_index
    limit 1;

    if v_region_id is null then
      if not exists (
        select 1 from public.regions where country_id = p_country_id
      ) then
        insert into public.regions (country_id, name)
        values (p_country_id, 'Stolica')
        returning id into v_region_id;
      else
        select count(*) + 1
          into v_new_region_no
        from public.regions
        where country_id = p_country_id;

        insert into public.regions (country_id, name)
        values (p_country_id, 'Region ' || v_new_region_no)
        returning id into v_region_id;
      end if;

      v_slot := 1;
    end if;

    insert into public.region_slots (region_id, slot_index, building)
    values (v_region_id, v_slot, 'factory_1');

    v_factory_count := v_factory_count + 1;
  end loop;
end;
$$;

revoke all on function public.grant_starter_factories(uuid) from public;
grant execute on function public.grant_starter_factories(uuid) to service_role;

-- Existing countries receive the same starting package once.
do $$
declare
  r record;
begin
  for r in select id from public.countries loop
    perform public.grant_starter_factories(r.id);
  end loop;
end;
$$;

-- New countries created by an administrator also receive the package.
create or replace function public.admin_create_country(p_name text, p_flag text default '🏳️')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Brak uprawnień administratora';
  end if;

  insert into public.countries (name, flag)
  values (p_name, coalesce(nullif(p_flag,''),'🏳️'))
  returning id into v_id;

  perform public.grant_starter_factories(v_id);

  insert into public.admin_actions (actor_id, country_id, action, details)
  values (
    auth.uid(),
    v_id,
    'CREATE_COUNTRY',
    jsonb_build_object('name', p_name, 'starter_factories', 3)
  );

  return v_id;
end;
$$;

create or replace function public.admin_create_country_for_user(
  p_user_id uuid,
  p_name text,
  p_flag text default ''
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
  values (trim(p_name), coalesce(nullif(trim(p_flag), ''), ''))
  returning id into v_country_id;

  perform public.grant_starter_factories(v_country_id);

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
      'user_id', p_user_id,
      'starter_factories', 3
    )
  );

  return v_country_id;
end;
$$;

grant execute on function public.admin_create_country_for_user(uuid, text, text) to authenticated;
