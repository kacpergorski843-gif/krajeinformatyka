-- Temporarily pause bilateral agreements without deleting historical data.
-- Stop the recurring scheduler and prevent API roles from creating, cancelling,
-- reading, or manually executing agreements until the feature is reintroduced.

DO $$
DECLARE
  v_job record;
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    FOR v_job IN
      SELECT jobid
      FROM cron.job
      WHERE jobname = 'bilateral-agreements-warsaw-20'
    LOOP
      PERFORM cron.unschedule(v_job.jobid);
    END LOOP;
  END IF;
END;
$$;

REVOKE ALL ON TABLE public.bilateral_agreements FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_create_bilateral_agreement_v2(uuid, uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, integer, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_cancel_bilateral_agreement(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.run_bilateral_agreements(date) FROM PUBLIC, anon, authenticated, service_role;
