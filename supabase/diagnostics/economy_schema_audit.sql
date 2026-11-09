-- Read-only production check for the economy schema.
-- Safe to run in the Supabase SQL editor; this script does not modify data or schema.

-- 1) Confirm whether the legacy run_number column still exists.
select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'economy_runs'
order by ordinal_position;

-- 2) Show every deployed overload of run_daily_economy().
select
  p.oid::regprocedure as function_signature,
  pg_get_functiondef(p.oid) as function_definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'run_daily_economy'
order by p.oid::regprocedure::text;

-- 3) Show the deployed definitions of the authoritative country-statistics views.
select
  c.relname as view_name,
  pg_get_viewdef(c.oid, true) as view_definition
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('v', 'm')
  and c.relname in ('country_stats', 'world_country_stats')
order by c.relname;

-- 4) Confirm the current income values used by the single-source economy.
select
  building,
  income_kr
from public.shop_items
where building::text like 'factory_%'
order by building;
