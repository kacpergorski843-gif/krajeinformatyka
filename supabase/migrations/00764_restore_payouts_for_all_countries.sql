-- Restore daily economy payouts for every country, regardless of player heartbeat.
-- Keep the existing admin checks, daily automatic limit, manual run numbering,
-- income calculations, resource production, bonuses, and reversal compatibility.

create or replace function public.run_daily_economy(
  p_run_date date default (now() at time zone 'Europe/Warsaw')::date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  r record;
  v_income numeric;
  v_coal numeric;
  v_upkeep numeric;
  v_bonus numeric;
  v_processed int := 0;
  v_total numeric := 0;
  v_skipped_inactive int := 0;
  v_run_id uuid;
  v_run_number smallint;
  v_label text;
begin
  if auth.uid() is null and current_user <> 'postgres' then
    raise exception 'Brak autoryzacji';
  end if;
  if auth.uid() is not null and not public.is_admin(auth.uid()) then
    raise exception 'Tylko administrator może uruchomić cykl dobowy';
  end if;
  if auth.uid() is not null
     and p_run_date <> (now() at time zone 'Europe/Warsaw')::date then
    raise exception 'Cykl można uruchomić tylko dla bieżącej daty';
  end if;

  perform pg_advisory_xact_lock(hashtext('daily-economy:' || p_run_date::text)::bigint);

  -- Authenticated administrator runs are manual and have no daily limit.
  -- Background/service runs (auth.uid() IS NULL) remain limited to one per day.
  if auth.uid() is null and exists (
    select 1
    from public.economy_runs
    where run_date = p_run_date
      and triggered_by is null
  ) then
    return jsonb_build_object(
      'ok', false,
      'reason', 'daily_limit_reached',
      'run_date', p_run_date,
      'runs', 1
    );
  end if;

  select (coalesce(max(run_number), 0) + 1)::smallint
  into v_run_number
  from public.economy_runs
  where run_date = p_run_date;

  v_label := 'Cykl dobowy ' || p_run_date::text || ' #' || v_run_number::text;

  insert into public.economy_runs (run_date, run_number, triggered_by)
  values (p_run_date, v_run_number, auth.uid())
  returning id into v_run_id;

  -- Payouts are issued to every country; player heartbeat is not a condition.
  for r in
    select cs.*
    from public.country_stats cs
  loop

    v_bonus := coalesce((
      select eb.percent
      from public.economy_bonuses eb
      where eb.starts_at <= now()
        and eb.ends_at > now()
        and (eb.country_id = r.country_id or eb.country_id is null)
      order by
        case when eb.country_id = r.country_id then 0 else 1 end,
        eb.ends_at asc
      limit 1
    ), 0);

    v_coal := r.coal + r.coal_prod;
    v_upkeep := r.coal_upkeep;
    v_income := r.gross_income;

    if v_upkeep > 0 and v_coal < v_upkeep then
      v_income := v_income - (
        select coalesce(sum(si.income_kr), 0)
        from public.region_slots s
        join public.regions g on g.id = s.region_id
        join public.shop_items si on si.building = s.building
        where g.country_id = r.country_id
          and s.building in ('factory_4', 'factory_5', 'factory_6')
      );
      v_upkeep := 0;
    end if;

    v_income := floor(v_income * (1 + v_bonus / 100));

    update public.countries
    set balance = balance + v_income,
        coal = coal + r.coal_prod - v_upkeep,
        oil = oil + r.oil_prod,
        copper = copper + r.copper_prod,
        iron = iron + r.iron_prod,
        uranium = uranium + r.uranium_prod
    where id = r.country_id;

    insert into public.transactions (
      country_id, kind, label, amount_kr, details
    )
    values (
      r.country_id,
      'ECONOMY',
      v_label,
      v_income,
      jsonb_build_object(
        'run_id', v_run_id,
        'run_number', v_run_number,
        'run_date', p_run_date,
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
    'total_kr', v_total,
    'inactive_skipped', v_skipped_inactive,
    'run_number', v_run_number,
    'manual', auth.uid() is not null
  )
  where id = v_run_id;

  return jsonb_build_object(
    'ok', true,
    'countries', v_processed,
    'total_kr', v_total,
    'run_date', p_run_date,
    'run_number', v_run_number,
    'inactive_skipped', v_skipped_inactive
  );
exception
  when unique_violation then
    return jsonb_build_object(
      'ok', false,
      'reason', 'daily_limit_reached',
      'run_date', p_run_date,
      'runs', 1
    );
end;
$function$;


revoke execute on function public.run_daily_economy(date) from public;
grant execute on function public.run_daily_economy(date) to authenticated, service_role;

notify pgrst, 'reload schema';
