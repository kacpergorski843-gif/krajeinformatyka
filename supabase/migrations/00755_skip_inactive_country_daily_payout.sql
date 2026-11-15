-- Superseded by migration 00758.
-- The previous version patched an obsolete run_daily_economy body and expected
-- v_run_number fields that are not present in migration 0076. Keep this file
-- harmless so databases that have not recorded it can continue migrating.
do $$
begin
  raise notice 'Inactive payout filtering is installed by migration 00758';
end;
$$;
