-- UPDATE 4.1: manageable income bonuses with optional country scope.
alter table public.economy_bonuses
  add column if not exists country_id uuid references public.countries(id) on delete cascade;

create or replace function public.admin_start_income_bonus(
  p_percent numeric,
  p_hours numeric,
  p_country_id uuid default null
)
returns jsonb language plpgsql security definer set search_path=public as $function$
declare v_role text; v_id uuid;
begin
  select role::text into v_role
  from public.user_roles
  where user_id=auth.uid() and role in ('ADMIN','MAIN_ADMIN')
  order by role desc limit 1;
  if v_role is null then raise exception 'Brak uprawnień administratora'; end if;
  if p_percent <= 0 or p_percent > 1000 or p_hours <= 0 or p_hours > 720 then
    raise exception 'Nieprawidłowy bonus lub czas';
  end if;
  if p_country_id is not null and not exists(select 1 from public.countries where id=p_country_id) then
    raise exception 'Nie znaleziono państwa';
  end if;
  insert into public.economy_bonuses(percent, starts_at, ends_at, created_by, country_id)
  values(p_percent, now(), now() + make_interval(hours=>p_hours), auth.uid(), p_country_id)
  returning id into v_id;
  insert into public.admin_actions(action, country_id, details, actor_id)
  values(
    'INCOME_BONUS',
    p_country_id,
    jsonb_build_object('bonus_id',v_id,'percent',p_percent,'hours',p_hours,'country_id',p_country_id),
    auth.uid()
  );
  return jsonb_build_object('ok',true,'id',v_id);
end;
$function$;

create or replace function public.admin_list_active_income_bonuses()
returns table(
  id uuid,
  percent numeric,
  starts_at timestamptz,
  ends_at timestamptz,
  country_id uuid,
  country_name text,
  created_at timestamptz
)
language plpgsql security definer set search_path=public as $function$
declare v_role text;
begin
  select role::text into v_role from public.user_roles
  where user_id=auth.uid() and role in ('ADMIN','MAIN_ADMIN')
  order by role desc limit 1;
  if v_role is null then raise exception 'Brak uprawnień administratora'; end if;
  return query
  select b.id,b.percent,b.starts_at,b.ends_at,b.country_id,c.name,b.created_at
  from public.economy_bonuses b
  left join public.countries c on c.id=b.country_id
  where b.starts_at <= now() and b.ends_at > now()
  order by b.ends_at asc;
end;
$function$;

create or replace function public.admin_remove_income_bonus(p_bonus_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $function$
declare v_role text; v_country_id uuid; v_percent numeric;
begin
  select role::text into v_role from public.user_roles
  where user_id=auth.uid() and role in ('ADMIN','MAIN_ADMIN')
  order by role desc limit 1;
  if v_role is null then raise exception 'Brak uprawnień administratora'; end if;
  select country_id, percent into v_country_id, v_percent
  from public.economy_bonuses where id=p_bonus_id for update;
  if not found then raise exception 'Nie znaleziono bonusu'; end if;
  update public.economy_bonuses set ends_at=least(ends_at, now()) where id=p_bonus_id;
  insert into public.admin_actions(action,country_id,details,actor_id)
  values('REMOVE_INCOME_BONUS',v_country_id,jsonb_build_object('bonus_id',p_bonus_id,'percent',v_percent),auth.uid());
  return jsonb_build_object('ok',true);
end;
$function$;

grant execute on function public.admin_start_income_bonus(numeric,numeric,uuid) to authenticated;
grant execute on function public.admin_list_active_income_bonuses() to authenticated;
grant execute on function public.admin_remove_income_bonus(uuid) to authenticated;
