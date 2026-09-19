-- Income bonus targeting: allow admins to apply a bonus globally or to one country.
alter table public.economy_bonuses
  add column if not exists country_id uuid references public.countries(id) on delete cascade;

create index if not exists economy_bonuses_country_active_idx
  on public.economy_bonuses(country_id, starts_at, ends_at);

create or replace function public.admin_start_income_bonus(
  p_percent numeric,
  p_hours numeric,
  p_country_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_role text;
  v_id uuid;
begin
  select role::text
    into v_role
  from public.user_roles
  where user_id = auth.uid()
    and role in ('ADMIN','MAIN_ADMIN')
  order by role desc
  limit 1;

  if v_role is null then
    raise exception 'Brak uprawnień administratora';
  end if;

  if p_percent <= 0 or p_percent > 1000 or p_hours <= 0 or p_hours > 720 then
    raise exception 'Nieprawidłowy bonus lub czas';
  end if;

  if p_country_id is not null and not exists (
    select 1 from public.countries where id = p_country_id
  ) then
    raise exception 'Nie znaleziono państwa';
  end if;

  insert into public.economy_bonuses(percent, starts_at, ends_at, created_by, country_id)
  values (
    p_percent,
    now(),
    now() + make_interval(hours => p_hours),
    auth.uid(),
    p_country_id
  )
  returning id into v_id;

  insert into public.admin_actions(action, country_id, details, actor_id)
  values (
    'INCOME_BONUS',
    p_country_id,
    jsonb_build_object(
      'bonus_id', v_id,
      'percent', p_percent,
      'hours', p_hours,
      'scope', case when p_country_id is null then 'GLOBAL' else 'COUNTRY' end
    ),
    auth.uid()
  );

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'country_id', p_country_id
  );
end;
$function$;

grant execute on function public.admin_start_income_bonus(numeric,numeric,uuid) to authenticated;

create or replace function public.run_daily_economy(
  p_run_date date default (now() at time zone 'Europe/Warsaw')::date
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  r record;
  v_income numeric;
  v_coal numeric;
  v_upkeep numeric;
  v_bonus numeric;
  v_processed int := 0;
  v_total numeric := 0;
begin
  if auth.uid() is not null and not public.is_admin(auth.uid()) then
    raise exception 'Tylko administrator może uruchomić cykl dobowy';
  end if;

  insert into public.economy_runs (run_date, triggered_by)
  values (p_run_date, auth.uid())
  on conflict (run_date) do nothing;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'already_run', 'run_date', p_run_date);
  end if;

  for r in select * from public.country_stats loop
    v_bonus := coalesce((
      select eb.percent
      from public.economy_bonuses eb
      where eb.starts_at <= now()
        and eb.ends_at > now()
        and (eb.country_id = r.country_id or eb.country_id is null)
      order by case when eb.country_id = r.country_id then 0 else 1 end, eb.ends_at asc
      limit 1
    ), 0);

    v_coal := r.coal + r.coal_prod;
    v_upkeep := r.coal_upkeep;
    v_income := r.gross_income;

    if v_upkeep > 0 and v_coal < v_upkeep then
      v_income := v_income - (
        select coalesce(sum(case s.building
          when 'factory_4' then 150000000000
          when 'factory_5' then 250000000000
          when 'factory_6' then 400000000000
          else 0 end),0)
        from public.region_slots s
        join public.regions g on g.id = s.region_id
        where g.country_id = r.country_id
          and s.building in ('factory_4','factory_5','factory_6')
      );
      v_upkeep := 0;
    end if;

    v_income := floor(v_income * (1 + v_bonus / 100));

    update public.countries set
      balance = balance + v_income,
      coal = coal + r.coal_prod - v_upkeep,
      oil = oil + r.oil_prod,
      copper = copper + r.copper_prod,
      iron = iron + r.iron_prod,
      uranium = uranium + r.uranium_prod
    where id = r.country_id;

    insert into public.transactions (country_id, kind, label, amount_kr, details)
    values (
      r.country_id, 'ECONOMY', 'Cykl dobowy ' || p_run_date, v_income,
      jsonb_build_object(
        'coal_prod', r.coal_prod,
        'coal_upkeep', v_upkeep,
        'oil', r.oil_prod,
        'copper', r.copper_prod,
        'iron', r.iron_prod,
        'uranium', r.uranium_prod,
        'income_bonus_percent', v_bonus
      )
    );

    v_processed := v_processed + 1;
    v_total := v_total + v_income;
  end loop;

  update public.economy_runs
  set summary = jsonb_build_object(
    'countries', v_processed,
    'total_kr', v_total
  )
  where run_date = p_run_date;

  return jsonb_build_object(
    'ok', true,
    'countries', v_processed,
    'total_kr', v_total
  );
end;
$$;

grant execute on function public.run_daily_economy(date) to authenticated;

create or replace function public.active_income_bonus()
returns jsonb
language sql
stable
security definer
set search_path=public
as $function$
  select coalesce(
    (
      select jsonb_build_object(
        'id', id,
        'percent', percent,
        'country_id', country_id,
        'starts_at', starts_at,
        'ends_at', ends_at
      )
      from public.economy_bonuses
      where starts_at <= now()
        and ends_at > now()
      order by ends_at asc
      limit 1
    ),
    jsonb_build_object(
      'id', null,
      'percent', 0,
      'country_id', null,
      'starts_at', null,
      'ends_at', null
    )
  );
$function$;

grant execute on function public.active_income_bonus() to authenticated;
