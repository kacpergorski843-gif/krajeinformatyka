-- Publish application tables so authenticated clients can react to database changes.
-- Realtime still applies each table's SELECT RLS policy; clients never receive rows they cannot read.
do $$
declare
  table_name text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'supabase_realtime publication does not exist; skipping publication setup';
    return;
  end if;

  foreach table_name in array array[
    'admin_actions',
    'app_maintenance_mode',
    'bilateral_agreement_runs',
    'bilateral_agreements',
    'countries',
    'country_suggestions',
    'economy_bonuses',
    'economy_runs',
    'missile_strikes',
    'profiles',
    'region_occupations',
    'region_slots',
    'regions',
    'shop_items',
    'transactions',
    'user_roles'
  ]
  loop
    if to_regclass(format('public.%I', table_name)) is not null
      and not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = table_name
      )
    then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end
$$;
