-- Repair test country stock without assuming identical integer widths across deployments.
-- This is deliberately a new migration: 00743 may already be applied in production.
do $$
declare
  v_column record;
  v_max numeric;
begin
  for v_column in
    select column_name, data_type, numeric_precision, numeric_scale
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'countries'
      and column_name in (
        'balance', 'coal', 'oil', 'copper', 'iron', 'uranium',
        'aa_defense', 'missile_1', 'missile_2', 'missile_3',
        'soldier_packs', 'tank_packs'
      )
  loop
    v_max := null;
    if v_column.data_type = 'numeric' then
      if v_column.numeric_precision is not null then
        v_max := floor(
          power(10::numeric, v_column.numeric_precision - coalesce(v_column.numeric_scale, 0)) - 1
        );
      else
        -- Unconstrained NUMERIC has no catalog precision; use a large but
        -- bounded reserve to leave room for future income and production.
        v_max := 1000000000000000000000000::numeric;
      end if;
    elsif v_column.data_type = 'smallint' then
      v_max := 32767;
    elsif v_column.data_type = 'integer' then
      v_max := 2147483647;
    elsif v_column.data_type = 'bigint' then
      v_max := 9223372036854775807;
    end if;

    if v_max is not null then
      v_max := least(
        v_max,
        case
          when v_column.column_name in (
            'aa_defense', 'missile_1', 'missile_2', 'missile_3',
            'soldier_packs', 'tank_packs'
          ) then 1000000::numeric
          else 1000000000000000000000000::numeric
        end
      );
      execute format(
        'update public.countries set %I = $1 where name in (%L, %L)',
        v_column.column_name, 'Testy v1', 'Testy v2'
      ) using v_max;
    end if;
  end loop;
end;
$$;

-- Rebuild the restricted stats view idempotently so a main administrator can
-- read test countries through the view queried by the country page.
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
notify pgrst, 'reload schema';
