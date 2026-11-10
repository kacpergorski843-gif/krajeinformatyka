-- 00748: country flags are now uploaded through the authenticated server
-- function, which verifies image signatures before writing Storage. The legacy
-- RPC accepts an arbitrary URL and would bypass that validation.
revoke all on function public.ruler_set_country_flag(uuid, text)
  from public, anon, authenticated;

notify pgrst, 'reload schema';
