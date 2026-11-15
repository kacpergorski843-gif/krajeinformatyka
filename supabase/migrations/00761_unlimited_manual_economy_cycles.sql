-- Allow unlimited administrator-triggered economy cycles while keeping one automatic
-- settlement per Warsaw day. Each cycle gets its own run_number and transaction label.

alter table public.economy_runs
  add column if not exists run_number smallint;

with numbered as (
  select id,
         row_number() over (partition by run_date order by ran_at, id)::smallint as assigned_number
  from public.economy_runs
  where run_number is null
)
update public.economy_runs er
set run_number = numbered.assigned_number
from numbered
where er.id = numbered.id;

alter table public.economy_runs
  alter column run_number set default 1,
  alter column run_number set not null;

alter table public.economy_runs
  drop constraint if exists economy_runs_run_date_key;

alter table public.economy_runs
  drop constraint if exists economy_runs_run_number_check;

alter table public.economy_runs
  add constraint economy_runs_run_number_check check (run_number > 0);

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

  for r in
    select cs.*, activity.last_activity_at
    from public.country_stats cs
    left join (
      select
        p.country_id,
        max(pa.last_seen_at) as last_activity_at
      from public.profiles p
      join public.player_activity pa on pa.user_id = p.id
      where p.country_id is not null
      group by p.country_id
    ) activity on activity.country_id = cs.country_id
  loop
    if r.last_activity_at is null
       or r.last_activity_at < now() - interval '5 days' then
      v_skipped_inactive := v_skipped_inactive + 1;
      continue;
    end if;

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

-- Reverse the exact latest cycle, including its run number in the transaction label.
create or replace function public.reverse_last_daily_economy()
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_run public.economy_runs%rowtype;
  v_label text;
  v_reversed_countries integer := 0;
  v_reversed_transactions integer := 0;
begin
  if auth.uid() is null or not public.is_admin(auth.uid()) then
    raise exception 'Tylko administrator może cofnąć cykl wypłat';
  end if;

  perform pg_advisory_xact_lock(hashtext('reverse-last-daily-economy')::bigint);

  select *
  into v_run
  from public.economy_runs
  where coalesce(summary->>'reversed_at', '') = ''
    and exists (
      select 1
      from public.transactions t
      where t.kind = 'ECONOMY'
        and t.country_id is not null
        and (
          t.label = 'Cykl dobowy ' || economy_runs.run_date::text || ' #' || economy_runs.run_number::text
          or (
            economy_runs.run_number = 1
            and t.label = 'Cykl dobowy ' || economy_runs.run_date::text
          )
        )
    )
  order by ran_at desc, run_date desc, run_number desc
  limit 1
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_active_cycle');
  end if;

  v_label := 'Cykl dobowy ' || v_run.run_date::text || ' #' || v_run.run_number::text;

  select count(*)::integer
  into v_reversed_transactions
  from public.transactions
  where kind = 'ECONOMY'
    and country_id is not null
    and (
      label = v_label
      or (v_run.run_number = 1 and label = 'Cykl dobowy ' || v_run.run_date::text)
    );

  with cycle_totals as (
    select
      country_id,
      sum(amount_kr) as income,
      sum(coalesce((details->>'coal_prod')::numeric, 0)) as coal_prod,
      sum(coalesce((details->>'coal_upkeep')::numeric, 0)) as coal_upkeep,
      sum(coalesce((details->>'oil')::numeric, 0)) as oil_prod,
      sum(coalesce((details->>'copper')::numeric, 0)) as copper_prod,
      sum(coalesce((details->>'iron')::numeric, 0)) as iron_prod,
      sum(coalesce((details->>'uranium')::numeric, 0)) as uranium_prod
    from public.transactions
    where kind = 'ECONOMY'
      and country_id is not null
      and (
        label = v_label
        or (v_run.run_number = 1 and label = 'Cykl dobowy ' || v_run.run_date::text)
      )
    group by country_id
  )
  update public.countries c
  set
    balance = c.balance - t.income,
    coal = c.coal - (t.coal_prod - t.coal_upkeep),
    oil = c.oil - t.oil_prod,
    copper = c.copper - t.copper_prod,
    iron = c.iron - t.iron_prod,
    uranium = c.uranium - t.uranium_prod
  from cycle_totals t
  where c.id = t.country_id;

  get diagnostics v_reversed_countries = row_count;

  insert into public.transactions (
    country_id, kind, label, amount_kr, actor_id, details
  )
  select
    t.country_id,
    'ECONOMY_REVERSAL',
    'Cofnięcie ' || v_label,
    -t.income,
    auth.uid(),
    jsonb_build_object(
      'reversed_run_id', v_run.id,
      'original_label', v_label,
      'run_date', v_run.run_date,
      'run_number', v_run.run_number,
      'reversed_transactions', t.transaction_count
    )
  from (
    select
      country_id,
      sum(amount_kr) as income,
      count(*)::integer as transaction_count
    from public.transactions
    where kind = 'ECONOMY'
      and country_id is not null
      and (
        label = v_label
        or (v_run.run_number = 1 and label = 'Cykl dobowy ' || v_run.run_date::text)
      )
    group by country_id
  ) t;

  update public.economy_runs
  set summary = coalesce(summary, '{}'::jsonb) || jsonb_build_object(
    'reversed_at', now(),
    'reversed_by', auth.uid()
  )
  where id = v_run.id;

  return jsonb_build_object(
    'ok', true,
    'run_id', v_run.id,
    'run_date', v_run.run_date,
    'run_number', v_run.run_number,
    'countries', v_reversed_countries,
    'transactions', v_reversed_transactions
  );
end;
$function$;

revoke all on function public.reverse_last_daily_economy() from public;
grant execute on function public.reverse_last_daily_economy() to authenticated;

notify pgrst, 'reload schema';
