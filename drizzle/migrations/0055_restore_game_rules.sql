-- 0055: restore intended two manual/automatic economy settlements per day
-- and remove purchase-limit rules from military transfers.
--
-- A second run is an operational recovery mechanism: if the 20:00 payout
-- is wrong, an administrator can run the economy again the same day.
-- The unique (run_date, run_number) index remains the concurrency guard.

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
  v_run_number smallint;
  v_run_id uuid;
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
        select coalesce(sum(
          case s.building
            when 'factory_4' then 150000000000
            when 'factory_5' then 250000000000
            when 'factory_6' then 400000000000
            else 0
          end
        ), 0)
        from public.region_slots s
        join public.regions g on g.id = s.region_id
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
      'Cykl dobowy ' || p_run_date || ' #' || v_run_number,
      v_income,
      jsonb_build_object(
        'coal_prod', r.coal_prod,
        'coal_upkeep', v_upkeep,
        'oil', r.oil_prod,
        'copper', r.copper_prod,
        'iron', r.iron_prod,
        'uranium', r.uranium_prod,
        'income_bonus_percent', v_bonus,
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

revoke execute on function public.run_daily_economy(date) from public;
grant execute on function public.run_daily_economy(date) to authenticated, service_role;

create or replace function public.transfer_military(
  p_from_country_id uuid,
  p_to_country_id uuid,
  p_resource text,
  p_amount integer,
  p_from_region_id uuid default null,
  p_to_region_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_from public.countries;
  v_to public.countries;
  v_from_region public.regions;
  v_to_region public.regions;
  v_from_name text;
  v_to_name text;
  v_lock_first uuid;
  v_lock_second uuid;
  v_available integer;
begin
  if auth.uid() is null then raise exception 'Brak autoryzacji'; end if;
  if p_amount is null or p_amount < 1 then raise exception 'Podaj dodatnią ilość'; end if;
  if p_from_country_id is null or p_to_country_id is null
     or p_from_country_id = p_to_country_id then
    raise exception 'Nieprawidłowe państwo nadawcy lub odbiorcy';
  end if;
  if p_resource not in ('soldier_packs','tank_packs','missile_1','missile_2','missile_3','aa_defense') then
    raise exception 'Ta jednostka nie może być obecnie przesyłana';
  end if;

  perform public.assert_can_manage(p_from_country_id);

  v_lock_first := least(p_from_country_id, p_to_country_id);
  v_lock_second := greatest(p_from_country_id, p_to_country_id);
  perform 1 from public.countries where id = v_lock_first for update;
  perform 1 from public.countries where id = v_lock_second for update;

  select * into v_from from public.countries where id = p_from_country_id;
  select * into v_to from public.countries where id = p_to_country_id;

  if v_from.id is null or v_to.id is null then
    raise exception 'Nie znaleziono państwa';
  end if;

  if p_resource = 'aa_defense' then
    if p_from_region_id is null or p_to_region_id is null then
      raise exception 'Dla OPL wybierz oba regiony';
    end if;
    if p_from_region_id = p_to_region_id then
      raise exception 'Region źródłowy i docelowy muszą być różne';
    end if;

    select * into v_from_region from public.regions where id = p_from_region_id for update;
    select * into v_to_region from public.regions where id = p_to_region_id for update;

    if v_from_region.id is null or v_to_region.id is null then
      raise exception 'Nie znaleziono regionu';
    end if;
    if v_from_region.country_id <> p_from_country_id then
      raise exception 'Region źródłowy nie należy do Twojego państwa';
    end if;
    if v_to_region.country_id <> p_to_country_id then
      raise exception 'Region docelowy nie należy do wybranego państwa';
    end if;
    if v_from_region.aa_defense < p_amount then
      raise exception 'Brak wystarczającej ilości OPL w regionie źródłowym';
    end if;

    update public.regions set aa_defense = aa_defense - p_amount where id = p_from_region_id;
    update public.regions set aa_defense = aa_defense + p_amount where id = p_to_region_id;
  else
    v_available := case p_resource
      when 'soldier_packs' then v_from.soldier_packs
      when 'tank_packs' then v_from.tank_packs
      when 'missile_1' then v_from.missile_1
      when 'missile_2' then v_from.missile_2
      when 'missile_3' then v_from.missile_3
      else 0
    end;

    if v_available < p_amount then
      raise exception 'Brak wystarczającej ilości jednostek';
    end if;

    execute format(
      'update public.countries set %I = %I - $1 where id = $2',
      p_resource, p_resource
    ) using p_amount, p_from_country_id;

    execute format(
      'update public.countries set %I = %I + $1 where id = $2',
      p_resource, p_resource
    ) using p_amount, p_to_country_id;
  end if;

  select name into v_from_name from public.countries where id = p_from_country_id;
  select name into v_to_name from public.countries where id = p_to_country_id;

  insert into public.transactions (
    country_id, kind, label, amount_kr, actor_id, details
  )
  values (
    p_from_country_id, 'TRANSFER',
    'Transfer wojskowy: ' || p_resource || ' → ' || v_to_name,
    0, auth.uid(),
    jsonb_build_object(
      'direction','out','resource',p_resource,'amount',p_amount,
      'to_country_id',p_to_country_id,
      'from_region_id',p_from_region_id,'to_region_id',p_to_region_id
    )
  );

  insert into public.transactions (
    country_id, kind, label, amount_kr, actor_id, details
  )
  values (
    p_to_country_id, 'TRANSFER',
    'Transfer wojskowy: ' || p_resource || ' ← ' || v_from_name,
    0, auth.uid(),
    jsonb_build_object(
      'direction','in','resource',p_resource,'amount',p_amount,
      'from_country_id',p_from_country_id,
      'from_region_id',p_from_region_id,'to_region_id',p_to_region_id
    )
  );

  return jsonb_build_object('ok',true,'resource',p_resource,'amount',p_amount);
end;
$function$;

revoke execute on function public.transfer_military(uuid,uuid,text,integer,uuid,uuid) from public;
grant execute on function public.transfer_military(uuid,uuid,text,integer,uuid,uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
