-- Prevent ordinary users from assigning a test country to their own profile.
create or replace function public.guard_test_country_profile_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.country_id is distinct from old.country_id
     and exists (
       select 1 from public.countries
       where id = new.country_id and name in ('Testy v1', 'Testy v2')
     )
     and not public.has_role(auth.uid(), 'MAIN_ADMIN') then
    raise exception 'Dostęp do państw testowych ma wyłącznie główny administrator';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_test_country_profile_assignment on public.profiles;
create trigger guard_test_country_profile_assignment
before update of country_id on public.profiles
for each row execute function public.guard_test_country_profile_assignment();

-- Isolated test countries and a main-admin-only country context switch.
-- Numeric stock fields use their maximum supported 30-digit value; integer military
-- counters use the largest positive PostgreSQL integer.
create table if not exists public.main_admin_test_sessions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  original_country_id uuid references public.countries(id) on delete set null,
  active_test_country_id uuid not null references public.countries(id) on delete cascade,
  updated_at timestamptz not null default now()
);
alter table public.main_admin_test_sessions enable row level security;
revoke all on public.main_admin_test_sessions from anon, authenticated;

insert into public.countries (
  name, flag, balance, coal, oil, copper, iron, uranium,
  aa_defense, missile_1, missile_2, missile_3, soldier_packs, tank_packs
)
values
  ('Testy v1', '🧪', 999999999999999999999999999999, 999999999999999999999999999999,
   999999999999999999999999999999, 999999999999999999999999999999,
   999999999999999999999999999999, 999999999999999999999999999999,
   2147483647, 2147483647, 2147483647, 2147483647, 2147483647, 2147483647),
  ('Testy v2', '🧪', 999999999999999999999999999999, 999999999999999999999999999999,
   999999999999999999999999999999, 999999999999999999999999999999,
   999999999999999999999999999999, 999999999999999999999999999999,
   2147483647, 2147483647, 2147483647, 2147483647, 2147483647, 2147483647)
on conflict (name) do update set
  flag = excluded.flag,
  balance = excluded.balance,
  coal = excluded.coal,
  oil = excluded.oil,
  copper = excluded.copper,
  iron = excluded.iron,
  uranium = excluded.uranium,
  aa_defense = excluded.aa_defense,
  missile_1 = excluded.missile_1,
  missile_2 = excluded.missile_2,
  missile_3 = excluded.missile_3,
  soldier_packs = excluded.soldier_packs,
  tank_packs = excluded.tank_packs;

-- Give both test worlds the same regional layout and existing building setup.
do $$
declare
  v_country record;
  v_region record;
  v_new_region_id uuid;
begin
  for v_country in
    select id from public.countries where name in ('Testy v1', 'Testy v2')
  loop
    if not exists (select 1 from public.regions where country_id = v_country.id) then
      for v_region in
        select r.id, r.name
        from public.regions r
        where r.country_id not in (
          select id from public.countries where name in ('Testy v1', 'Testy v2')
        )
        order by r.created_at, r.name
      loop
        insert into public.regions (country_id, name)
        values (v_country.id, v_region.name)
        returning id into v_new_region_id;

        insert into public.region_slots (region_id, slot_index, building)
        select v_new_region_id, slot_index, building
        from public.region_slots
        where region_id = v_region.id;
      end loop;
    end if;
  end loop;
end;
$$;

create or replace function public.main_admin_switch_test_country(p_target text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_current_country_id uuid;
  v_target_country_id uuid;
  v_original_country_id uuid;
  v_country_name text;
begin
  if v_user_id is null then
    raise exception 'Brak autoryzacji';
  end if;
  if not public.has_role(v_user_id, 'MAIN_ADMIN') then
    raise exception 'Tylko główny administrator może przełączać środowisko testowe';
  end if;

  select country_id into v_current_country_id
  from public.profiles
  where id = v_user_id
  for update;

  if not found then
    raise exception 'Nie znaleziono profilu administratora';
  end if;

  if p_target = 'ORIGINAL' then
    select original_country_id into v_original_country_id
    from public.main_admin_test_sessions
    where user_id = v_user_id;

    if not found then
      return jsonb_build_object('ok', true, 'changed', false, 'country_id', v_current_country_id);
    end if;

    if v_original_country_id is null then
      raise exception 'Nie można przywrócić pierwotnego państwa — nie istnieje już w bazie';
    end if;

    update public.profiles set country_id = v_original_country_id where id = v_user_id;
    delete from public.main_admin_test_sessions where user_id = v_user_id;

    select name into v_country_name from public.countries where id = v_original_country_id;
    return jsonb_build_object('ok', true, 'changed', true, 'mode', 'ORIGINAL',
      'country_id', v_original_country_id, 'country_name', v_country_name);
  end if;

  if p_target not in ('V1', 'V2') then
    raise exception 'Nieznane środowisko testowe';
  end if;

  select id, name into v_target_country_id, v_country_name
  from public.countries
  where name = case p_target when 'V1' then 'Testy v1' else 'Testy v2' end;

  if v_target_country_id is null then
    raise exception 'Nie znaleziono wybranego państwa testowego';
  end if;

  if v_current_country_id is distinct from v_target_country_id then
    insert into public.main_admin_test_sessions (user_id, original_country_id, active_test_country_id)
    values (v_user_id, v_current_country_id, v_target_country_id)
    on conflict (user_id) do update
      set active_test_country_id = excluded.active_test_country_id,
          updated_at = now();

    update public.profiles set country_id = v_target_country_id where id = v_user_id;
  end if;

  return jsonb_build_object('ok', true, 'changed', true, 'mode', p_target,
    'country_id', v_target_country_id, 'country_name', v_country_name);
end;
$$;

revoke all on function public.main_admin_switch_test_country(text) from public;
grant execute on function public.main_admin_switch_test_country(text) to authenticated;


-- Test countries, their regions and their slots are invisible to everyone else.
drop policy if exists "countries readable" on public.countries;
create policy "countries readable" on public.countries
for select to authenticated
using (name not in ('Testy v1', 'Testy v2') or public.has_role(auth.uid(), 'MAIN_ADMIN'));

drop policy if exists "regions readable" on public.regions;
create policy "regions readable" on public.regions
for select to authenticated
using (
  exists (
    select 1 from public.countries c
    where c.id = regions.country_id
      and (c.name not in ('Testy v1', 'Testy v2') or public.has_role(auth.uid(), 'MAIN_ADMIN'))
  )
);

drop policy if exists "slots readable" on public.region_slots;
create policy "slots readable" on public.region_slots
for select to authenticated
using (
  exists (
    select 1
    from public.regions r
    join public.countries c on c.id = r.country_id
    where r.id = region_slots.region_id
      and (c.name not in ('Testy v1', 'Testy v2') or public.has_role(auth.uid(), 'MAIN_ADMIN'))
  )
);

create or replace view public.world_country_stats
with (security_invoker = false) as
select
  country_id, name, flag, balance, coal, oil, copper, iron, uranium,
  aa_defense, missile_1, missile_2, missile_3, soldier_packs, tank_packs,
  war_votes, fort_votes, total_votes, regions_count, gross_income, coal_upkeep,
  coal_prod, oil_prod, copper_prod, iron_prod, uranium_prod, forts,
  military_value, vote_potential, region_aa_total
from public.country_stats
where name not in ('Testy v1', 'Testy v2')
   or public.has_role(auth.uid(), 'MAIN_ADMIN');

grant select on public.world_country_stats to authenticated;


-- Keep the public ranking free of internal test environments.
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
) x on x.country_id = c.id
where c.name not in ('Testy v1', 'Testy v2')
   or public.has_role(auth.uid(), 'MAIN_ADMIN');

grant select on public.public_ranking to anon, authenticated;
notify pgrst, 'reload schema';
