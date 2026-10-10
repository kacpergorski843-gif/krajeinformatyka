-- Ensure recurring bilateral agreements are actually scheduled in the production Supabase project.
-- The original scheduler was only present in the Drizzle migration chain, while production
-- uses supabase/migrations as its source of truth.
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
DECLARE
  v_job_id bigint;
BEGIN
  FOR v_job_id IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'bilateral-agreements-warsaw-20'
  LOOP
    PERFORM cron.unschedule(v_job_id);
  END LOOP;

  -- Run at minute 2 of each hour; only execute the settlement at 20:02 Warsaw time.
  PERFORM cron.schedule(
    'bilateral-agreements-warsaw-20',
    '2 * * * *',
    $job$SELECT public.run_bilateral_agreements()
      WHERE extract(hour FROM (now() AT TIME ZONE 'Europe/Warsaw')) = 20;$job$
  );
END
$$;
