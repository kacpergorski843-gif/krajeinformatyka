DO $mig$
DECLARE v_cs text := pg_get_viewdef('public.country_stats'::regclass);
        v_pr text := pg_get_viewdef('public.public_ranking'::regclass);
BEGIN
  DROP VIEW public.country_stats;
  DROP VIEW public.public_ranking;
  ALTER TABLE public.countries
    ALTER COLUMN balance TYPE numeric(60,0),
    ALTER COLUMN coal TYPE numeric(60,0),
    ALTER COLUMN oil TYPE numeric(60,0),
    ALTER COLUMN copper TYPE numeric(60,0),
    ALTER COLUMN iron TYPE numeric(60,0),
    ALTER COLUMN uranium TYPE numeric(60,0);
  EXECUTE 'CREATE VIEW public.country_stats WITH (security_invoker=true) AS ' || v_cs;
  EXECUTE 'CREATE VIEW public.public_ranking WITH (security_invoker=false) AS ' || v_pr;
END $mig$;
GRANT ALL ON public.country_stats TO anon, authenticated, service_role;
GRANT ALL ON public.public_ranking TO anon, authenticated, service_role;