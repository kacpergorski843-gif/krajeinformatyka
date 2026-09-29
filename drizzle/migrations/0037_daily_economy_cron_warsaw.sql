-- Run the automatic economy cycle at 20:00 Europe/Warsaw,
-- regardless of daylight-saving time.
--
-- pg_cron runs hourly and the command itself checks Warsaw local time.
-- The SECURITY DEFINER function remains restricted for application callers,
-- while the database scheduler is allowed to invoke it internally.

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
  v_processed int := 0;
  v_total numeric := 0;
  v_run_number smallint;
  v_run_id uuid;
begin
  if auth.uid() is null and current_user <> 'postgres' then
    raise exception 'Brak autoryzacji';
  end if;

  if auth.uid() is not null and not public.is_admin(auth.uid()) then
    raise exception 'Tylko administrator może uruchomić cykl dobowy';
  end if;

  select coalesce(max(run_number), 0) + 1
    into v_run_number
  from public.economy_runs
  where run_date = p_run_date;

  if v_run_number > 2 then
    return jsonb_build_object(
      'ok', false,
      'reason', 'daily_limit_reached',
      'run_date', p_run_date,
      'runs', 2
    );
  end if;

  insert into public.economy_runs (run_date, run_number, triggered_by)
  values (p_run_date, v_run_number, auth.uid())
  returning id into v_run_id;

  for r in select * from public.country_stats loop
    v_coal := r.coal + r.coal_prod;
    v_upkeep := r.coal_upkeep;
    v_income := r.gross_income;

    if v_upkeep > 0 and v_coal < v_upkeep then
      v_income := v_income - (
        select coalesce(sum(
          case s.building
            when 'factory_4' then 150000000000
            when 'factory_5' then 250000000000
            else 0
          end
        ), 0)
        from public.region_slots s
        join public.regions g on g.id = s.region_id
        where g.country_id = r.country_id
          and s.building in ('factory_4', 'factory_5')
      );
      v_upkeep := 0;
    end if;

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
      'Cykl dobowy ' || p_run_date || ' #' || v_run_number,
      v_income,
      jsonb_build_object(
        'coal_prod', r.coal_prod,
        'coal_upkeep', v_upkeep,
        'oil', r.oil_prod,
        'copper', r.copper_prod,
        'iron', r.iron_prod,
        'uranium', r.uranium_prod,
        'run_number', v_run_number
      )
    );

    v_processed := v_processed + 1;
    v_total := v_total + v_income;
  end loop;

  update public.economy_runs
  set summary = jsonb_build_object(
    'countries', v_processed,
    'total_kr', v_total,
    'run_number', v_run_number
  )
  where id = v_run_id;

  return jsonb_build_object(
    'ok', true,
    'countries', v_processed,
    'total_kr', v_total,
    'run_date', p_run_date,
    'run_number', v_run_number
  );
exception
  when unique_violation then
    return jsonb_build_object(
      'ok', false,
      'reason', 'daily_limit_reached',
      'run_date', p_run_date,
      'runs', 2
    );
end;
$function$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('daily-economy-warsaw');
    perform cron.schedule(
      'daily-economy-warsaw',
      '0 * * * *',
      $job$select public.run_daily_economy() where extract(hour from (now() at time zone 'Europe/Warsaw')) = 20;$job$
    );
  end if;
end;
$$;

notify pgrst, 'reload schema';
