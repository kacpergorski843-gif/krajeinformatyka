-- Heartbeat-only activity. No activity is seeded from accounts or profiles.
create table if not exists public.player_activity (
  user_id uuid primary key,
  last_seen_at timestamptz not null default now()
);
grant select, insert, update on public.player_activity to authenticated;
grant all on public.player_activity to service_role;
revoke all on public.player_activity from public, anon;
alter table public.player_activity enable row level security;
drop policy if exists "Players can read their own activity" on public.player_activity;
create policy "Players can read their own activity" on public.player_activity
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Players can insert their own activity" on public.player_activity;
create policy "Players can insert their own activity" on public.player_activity
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Players can update their own activity" on public.player_activity;
create policy "Players can update their own activity" on public.player_activity
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists player_activity_last_seen_idx on public.player_activity(last_seen_at);

-- Compatibility with already published clients: ignore their device clocks.
create or replace function public.stamp_player_activity()
returns trigger language plpgsql set search_path = public as $$
begin
  if TG_OP = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'Nie można zmieniać właściciela aktywności';
  end if;
  new.last_seen_at := statement_timestamp();
  return new;
end;
$$;
drop trigger if exists stamp_player_activity_timestamp on public.player_activity;
create trigger stamp_player_activity_timestamp before insert or update on public.player_activity
  for each row execute function public.stamp_player_activity();

-- No profile/signup initialization, including installations that ran legacy SQL.
drop trigger if exists initialize_player_activity_after_profile_insert on public.profiles;
drop function if exists public.initialize_player_activity();

create or replace function public.record_player_activity()
returns timestamptz language plpgsql security invoker set search_path = public as $$
declare v_user_id uuid := auth.uid(); v_seen timestamptz;
begin
  if v_user_id is null then raise exception 'Brak autoryzacji'; end if;
  insert into public.player_activity(user_id, last_seen_at)
  values (v_user_id, statement_timestamp())
  on conflict (user_id) do update set last_seen_at = excluded.last_seen_at
  returning last_seen_at into v_seen;
  return v_seen;
end;
$$;
revoke execute on function public.record_player_activity() from public, anon;
grant execute on function public.record_player_activity() to authenticated;
revoke execute on function public.stamp_player_activity() from public, anon;

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
begin
  if p_run_date is null then
    raise exception 'Data cyklu jest wymagana';
  end if;
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

  if exists (
    select 1
    from public.economy_runs
    where run_date = p_run_date
  ) then
    return jsonb_build_object(
      'ok', false,
      'reason', 'daily_limit_reached',
      'run_date', p_run_date,
      'runs', 1
    );
  end if;

  insert into public.economy_runs (run_date, triggered_by)
  values (p_run_date, auth.uid())
  returning id into v_run_id;

  for r in
    select cs.*, activity.last_activity_at
    from public.country_stats cs
    left join (
      select
        p.country_id,
        max(pa.last_seen_at) filter (where pa.last_seen_at <= now()) as last_activity_at
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
      'Cykl dobowy ' || p_run_date || ' #1',
      v_income,
      jsonb_build_object(
        'coal_prod', r.coal_prod,
        'coal_upkeep', v_upkeep,
        'oil', r.oil_prod,
        'copper', r.copper_prod,
        'iron', r.iron_prod,
        'uranium', r.uranium_prod,
        'income_bonus_percent', v_bonus,
        'run_number', 1
      )
    );

    v_processed := v_processed + 1;
    v_total := v_total + v_income;
  end loop;

  update public.economy_runs
  set summary = jsonb_build_object(
    'countries', v_processed,
    'total_kr', v_total::text,
    'inactive_skipped', v_skipped_inactive,
    'run_number', 1
  )
  where id = v_run_id;

  return jsonb_build_object(
    'ok', true,
    'countries', v_processed,
    'total_kr', v_total::text,
    'run_date', p_run_date,
    'inactive_skipped', v_skipped_inactive,
    'run_number', 1
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

revoke execute on function public.run_daily_economy(date) from public, anon;
grant execute on function public.run_daily_economy(date) to authenticated, service_role;

notify pgrst, 'reload schema';