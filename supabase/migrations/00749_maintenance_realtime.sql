-- Deliver maintenance-mode changes to connected authenticated clients immediately.
-- The existing SELECT policy on app_maintenance_mode controls which clients can receive rows.
do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'app_maintenance_mode'
  ) then
    execute 'alter publication supabase_realtime add table public.app_maintenance_mode';
  end if;
end
$$;
