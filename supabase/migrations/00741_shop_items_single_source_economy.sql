-- 00741: use shop_items as the single source of truth for building economics.
-- Existing buildings automatically inherit current product settings; no rebuild
-- or per-slot data migration is required.

create or replace view public.country_stats
with (security_invoker = true) as
select
  c.id as country_id,
  c.name,
  c.flag,
  c.balance,
  c.coal,
  c.oil,
  c.copper,
  c.iron,
  c.uranium,
  c.aa_defense,
  c.missile_1,
  c.missile_2,
  c.missile_3,
  c.soldier_packs,
  c.tank_packs,
  least(c.soldier_packs, 6) + least(c.tank_packs, 4) as war_votes,
  coalesce(b.regions_count, 0) as regions_count,
  coalesce(b.gross_income, 0)::numeric(30,0) as gross_income,
  coalesce(b.coal_upkeep, 0)::numeric(30,0) as coal_upkeep,
  coalesce(b.coal_prod, 0)::numeric(30,0) as coal_prod,
  coalesce(b.oil_prod, 0)::numeric(30,0) as oil_prod,
  coalesce(b.copper_prod, 0)::numeric(30,0) as copper_prod,
  coalesce(b.iron_prod, 0)::numeric(30,0) as iron_prod,
  coalesce(b.uranium_prod, 0)::numeric(30,0) as uranium_prod,
  coalesce(b.forts, 0) as forts,
  (
    c.aa_defense::numeric * 1000000000
    + c.missile_1::numeric * 2000000000
    + c.missile_2::numeric * 5000000000
    + c.missile_3::numeric * 12000000000
    + c.soldier_packs::numeric * 20000000000
    + c.tank_packs::numeric * 30000000000
    + coalesce(b.forts, 0)::numeric * 40000000000
  )::numeric(30,0) as military_value,
  coalesce(b.fort_votes, 0)::int as fort_votes,
  (
    least(c.soldier_packs, 6)
    + least(c.tank_packs, 4)
    + coalesce(b.fort_votes, 0)
  )::int as total_votes,
  (least(c.soldier_packs, 6) + least(c.tank_packs, 4))::int as vote_potential,
  coalesce(b.region_aa_total, 0)::int as region_aa_total
from public.countries c
left join (
  select
    r.country_id,
    count(distinct r.id) as regions_count,
    sum(coalesce(si.income_kr, 0)) as gross_income,
    sum(coalesce(si.upkeep_coal, 0)) as coal_upkeep,
    sum(case when si.produces = 'coal' then coalesce(si.produces_amount, 0) else 0 end) as coal_prod,
    sum(case when si.produces = 'oil' then coalesce(si.produces_amount, 0) else 0 end) as oil_prod,
    sum(case when si.produces = 'copper' then coalesce(si.produces_amount, 0) else 0 end) as copper_prod,
    sum(case when si.produces = 'iron' then coalesce(si.produces_amount, 0) else 0 end) as iron_prod,
    sum(case when si.produces = 'uranium' then coalesce(si.produces_amount, 0) else 0 end) as uranium_prod,
    count(s.id) filter (where s.building in ('fort_1','fort_2','fort_3')) as forts,
    sum(case s.building
      when 'fort_1' then 1
      when 'fort_2' then 2
      when 'fort_3' then 3
      else 0
    end) as fort_votes,
    (
      select sum(r2.aa_defense)
      from public.regions r2
      where r2.country_id = r.country_id
    ) as region_aa_total
  from public.regions r
  left join public.region_slots s on s.region_id = r.id
  left join public.shop_items si on si.building = s.building
  group by r.country_id
) b on b.country_id = c.id;

grant select on public.country_stats to authenticated;

-- Keep the public economic ranking consistent with the same live product values.
create or replace view public.public_ranking
with (security_invoker = false) as
select
  c.id as country_id,
  c.name,
  c.flag,
  coalesce(x.gross_income,0::numeric)::numeric(30,0) as gross_income,
  (
    c.aa_defense::numeric * 1000000000
    + c.missile_1::numeric * 2000000000
    + c.missile_2::numeric * 5000000000
    + c.missile_3::numeric * 12000000000
    + c.soldier_packs::numeric * 20000000000
    + c.tank_packs::numeric * 30000000000
    + coalesce(x.fort_votes,0)::numeric * 40000000000
  )::numeric(30,0) as military_value,
  least(c.soldier_packs, 6) + least(c.tank_packs, 4) as war_votes,
  coalesce(x.regions_count,0)::int as regions_count
from public.countries c
left join (
  select
    r.country_id,
    count(distinct r.id) as regions_count,
    sum(coalesce(si.income_kr, 0)) as gross_income,
    sum(case s.building
      when 'fort_1' then 1
      when 'fort_2' then 2
      when 'fort_3' then 3
      else 0
    end) as fort_votes
  from public.regions r
  left join public.region_slots s on s.region_id = r.id
  left join public.shop_items si on si.building = s.building
  group by r.country_id
) x on x.country_id = c.id;

grant select on public.public_ranking to anon, authenticated;
notify pgrst, 'reload schema';

-- Daily settlement already reads country_stats; keep the no-coal penalty
-- dynamic too, so changing a factory's income in the shop affects payouts.
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
  select coalesce(max(run_number), 0) + 1 into v_run_number
  from public.economy_runs where run_date = p_run_date;
  if v_run_number > 2 then
    return jsonb_build_object('ok', false, 'reason', 'daily_limit_reached',
      'run_date', p_run_date, 'runs', 2);
  end if;

  insert into public.economy_runs (run_date, run_number, triggered_by)
  values (p_run_date, v_run_number, auth.uid()) returning id into v_run_id;

  for r in select * from public.country_stats loop
    v_bonus := coalesce((
      select eb.percent from public.economy_bonuses eb
      where eb.starts_at <= now() and eb.ends_at > now()
        and (eb.country_id = r.country_id or eb.country_id is null)
      order by case when eb.country_id = r.country_id then 0 else 1 end,
        eb.ends_at asc limit 1
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

    insert into public.transactions (country_id, kind, label, amount_kr, details)
    values (r.country_id, 'ECONOMY',
      'Cykl dobowy ' || p_run_date || ' #' || v_run_number,
      v_income,
      jsonb_build_object(
        'coal_prod', r.coal_prod, 'coal_upkeep', v_upkeep,
        'oil', r.oil_prod, 'copper', r.copper_prod,
        'iron', r.iron_prod, 'uranium', r.uranium_prod,
        'income_bonus_percent', v_bonus, 'run_number', v_run_number
      ));
    v_processed := v_processed + 1;
    v_total := v_total + v_income;
  end loop;

  update public.economy_runs set summary = jsonb_build_object(
    'countries', v_processed, 'total_kr', v_total, 'run_number', v_run_number
  ) where id = v_run_id;

  return jsonb_build_object('ok', true, 'countries', v_processed,
    'total_kr', v_total, 'run_date', p_run_date, 'run_number', v_run_number);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'reason', 'daily_limit_reached',
    'run_date', p_run_date, 'runs', 2);
end;
$function$;

revoke execute on function public.run_daily_economy(date) from public;
grant execute on function public.run_daily_economy(date) to authenticated, service_role;
notify pgrst, 'reload schema';
