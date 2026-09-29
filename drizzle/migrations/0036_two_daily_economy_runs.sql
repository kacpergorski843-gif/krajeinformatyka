-- Allow up to two economy cycles per Warsaw calendar day.
-- Existing runs become run_number = 1.
-- The second run is stored separately and remains idempotent per slot.

alter table public.economy_runs
  drop constraint if exists economy_runs_run_date_key;

alter table public.economy_runs
  add column if not exists run_number smallint not null default 1;

alter table public.economy_runs
  add constraint economy_runs_run_number_check
  check (run_number in (1, 2));

create unique index if not exists economy_runs_date_number_idx
  on public.economy_runs (run_date, run_number);

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
  if auth.uid() is null then
    raise exception 'Brak autoryzacji';
  end if;

  if not public.is_admin(auth.uid()) then
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
