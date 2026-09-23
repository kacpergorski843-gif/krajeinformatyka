-- UPDATE 5.0: security hardening
-- Ensure SECURITY DEFINER RPCs cannot be invoked by anonymous callers.
-- Keep authorization inside each function; this migration also closes the
-- PostgreSQL default EXECUTE grant on any SECURITY DEFINER function created
-- by later migrations.

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
begin
  if auth.uid() is null then
    raise exception 'Brak autoryzacji';
  end if;

  if not public.is_admin(auth.uid()) then
    raise exception 'Tylko administrator może uruchomić cykl dobowy';
  end if;

  insert into public.economy_runs (run_date, triggered_by)
  values (p_run_date, auth.uid())
  on conflict (run_date) do nothing;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'reason', 'already_run',
      'run_date', p_run_date
    );
  end if;

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
      'Cykl dobowy ' || p_run_date,
      v_income,
      jsonb_build_object(
        'coal_prod', r.coal_prod,
        'coal_upkeep', v_upkeep,
        'oil', r.oil_prod,
        'copper', r.copper_prod,
        'iron', r.iron_prod,
        'uranium', r.uranium_prod
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
$function$;

-- Revoke the default PUBLIC EXECUTE privilege from every SECURITY DEFINER
-- function in public. Explicit grants below preserve application access.
do $$
declare
  r record;
begin
  for r in
    select
      n.nspname as schema_name,
      p.proname as function_name,
      pg_get_function_identity_arguments(p.oid) as identity_args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef = true
  loop
    execute format(
      'revoke execute on function %I.%I(%s) from public',
      r.schema_name,
      r.function_name,
      r.identity_args
    );
    execute format(
      'grant execute on function %I.%I(%s) to authenticated, service_role',
      r.schema_name,
      r.function_name,
      r.identity_args
    );
  end loop;
end
$$;

notify pgrst, 'reload schema';
