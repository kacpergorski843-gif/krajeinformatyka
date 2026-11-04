-- Move the automatic daily economy settlement from 20:00 to 20:05 Europe/Warsaw.
-- Run pg_cron every five minutes so the local-time check remains DST-safe.
do $$
declare
  v_job_id bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    for v_job_id in
      select jobid from cron.job where jobname = 'daily-economy-warsaw'
    loop
      perform cron.unschedule(v_job_id);
    end loop;

    perform cron.schedule(
      'daily-economy-warsaw',
      '*/5 * * * *',
      $job$select public.run_daily_economy()
        where extract(hour from (now() at time zone 'Europe/Warsaw')) = 20
          and extract(minute from (now() at time zone 'Europe/Warsaw')) = 5;$job$
    );
  end if;
end;
$$;
