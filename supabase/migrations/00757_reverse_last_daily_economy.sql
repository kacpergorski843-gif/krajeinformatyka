-- Reverse the most recent daily economy cycle that has not already been reversed.
-- The original economy transactions are retained for a complete audit trail.
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
  order by ran_at desc, run_date desc
  limit 1
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_active_cycle');
  end if;

  v_label := 'Cykl dobowy ' || v_run.run_date::text;

  select count(*)::integer
  into v_reversed_transactions
  from public.transactions
  where kind = 'ECONOMY'
    and label = v_label
    and country_id is not null;

  -- Apply the exact inverse of the values recorded by the original cycle.
  -- Later player activity is preserved; balances may become negative if a
  -- player has already spent part of the payout being reversed.
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
      and label = v_label
      and country_id is not null
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

  -- Keep the original entries and append compensating entries to history.
  insert into public.transactions (
    country_id, kind, label, amount_kr, actor_id, details
  )
  select
    t.country_id,
    'ECONOMY_REVERSAL',
    'Cofnięcie cyklu dobowego ' || v_run.run_date::text,
    -t.income,
    auth.uid(),
    jsonb_build_object(
      'reversed_run_id', v_run.id,
      'run_date', v_run.run_date,
      'reversed_transactions', t.transaction_count
    )
  from (
    select
      country_id,
      sum(amount_kr) as income,
      count(*)::integer as transaction_count
    from public.transactions
    where kind = 'ECONOMY'
      and label = v_label
      and country_id is not null
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
    'countries', v_reversed_countries,
    'transactions', v_reversed_transactions
  );
end;
$function$;

revoke all on function public.reverse_last_daily_economy() from public;
grant execute on function public.reverse_last_daily_economy() to authenticated;
notify pgrst, 'reload schema';
