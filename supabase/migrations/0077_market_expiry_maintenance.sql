-- Keep escrowed market inventory and expired negotiations from getting stuck.
create index if not exists market_offers_expiry_idx
  on public.market_offers (expires_at)
  where status = 'ACTIVE';

create index if not exists market_negotiations_expiry_idx
  on public.market_negotiations (expires_at)
  where status = 'PENDING';

create or replace function public.market_run_expiry_maintenance()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expired_offers integer := 0;
  v_expired_negotiations integer := 0;
begin
  update public.market_negotiations
  set status = 'EXPIRED', updated_at = now()
  where status = 'PENDING'
    and expires_at <= now();
  get diagnostics v_expired_negotiations = row_count;

  v_expired_offers := public.market_expire_offers();
  return v_expired_offers + v_expired_negotiations;
end;
$$;

revoke all on function public.market_run_expiry_maintenance() from public, anon, authenticated;
grant execute on function public.market_run_expiry_maintenance() to service_role;

-- pg_cron runs the expiry worker independently of player activity.
do $$
declare
  v_job_id bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    for v_job_id in
      select jobid from cron.job where jobname = 'market-expiry-maintenance'
    loop
      perform cron.unschedule(v_job_id);
    end loop;

    perform cron.schedule(
      'market-expiry-maintenance',
      '*/5 * * * *',
      'select public.market_run_expiry_maintenance()'
    );
  end if;
end;
$$;
