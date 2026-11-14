-- Skip daily economy payouts for countries whose assigned player has not
-- signed in for more than five days. If multiple accounts are assigned to a
-- country, activity by any one of them keeps the country eligible.
-- For accounts that have never signed in, created_at is used as the baseline.
-- Countries without an assigned profile retain the existing payout behavior.

DO $inactive_country_payout$
DECLARE
  v_def text;
  -- pg_get_functiondef preserves the installed function body, whose spacing
  -- and keyword casing may differ between database versions.
  v_loop_pattern text := 'for[[:space:]]+r[[:space:]]+in[[:space:]]+select[[:space:]]+\\*[[:space:]]+from[[:space:]]+public\\.country_stats[[:space:]]+loop';
  v_new_loop text := $replacement$
  for r in
    select cs.*, activity.last_activity_at
    from public.country_stats cs
    left join (
      select
        p.country_id,
        max(coalesce(u.last_sign_in_at, u.created_at)) as last_activity_at
      from public.profiles p
      join auth.users u on u.id = p.id
      where p.country_id is not null
      group by p.country_id
    ) activity on activity.country_id = cs.country_id
  loop
    if r.last_activity_at is not null
       and r.last_activity_at < now() - interval '5 days' then
      v_skipped_inactive := v_skipped_inactive + 1;
      continue;
    end if;
$replacement$;
  v_old_summary text := $old$
  update public.economy_runs set summary = jsonb_build_object(
    'countries', v_processed, 'total_kr', v_total::text, 'run_number', v_run_number
  ) where id = v_run_id;
$old$;
  v_new_summary text := $new$
  update public.economy_runs set summary = jsonb_build_object(
    'countries', v_processed,
    'total_kr', v_total::text,
    'run_number', v_run_number,
    'inactive_skipped', v_skipped_inactive
  ) where id = v_run_id;
$new$;
  v_old_return text := $old$
  return jsonb_build_object('ok', true, 'countries', v_processed,
    'total_kr', v_total::text, 'run_date', p_run_date, 'run_number', v_run_number);
$old$;
  v_new_return text := $new$
  return jsonb_build_object('ok', true, 'countries', v_processed,
    'total_kr', v_total::text, 'run_date', p_run_date,
    'run_number', v_run_number, 'inactive_skipped', v_skipped_inactive);
$new$;
BEGIN
  v_def := pg_get_functiondef('public.run_daily_economy(date)'::regprocedure);

  IF position('  v_total numeric := 0;' in v_def) = 0 THEN
    RAISE EXCEPTION 'Nie znaleziono oczekiwanej deklaracji v_total w run_daily_economy';
  END IF;
  v_def := replace(
    v_def,
    '  v_total numeric := 0;',
    '  v_total numeric := 0;' || E'\n  v_skipped_inactive integer := 0;'
  );

  IF v_def !~* v_loop_pattern THEN
    RAISE EXCEPTION 'Nie znaleziono pętli odczytującej public.country_stats w run_daily_economy';
  END IF;
  v_def := regexp_replace(v_def, v_loop_pattern, v_new_loop, 'i');

  IF position(v_old_summary in v_def) = 0 THEN
    RAISE EXCEPTION 'Nie znaleziono oczekiwanego zapisu podsumowania economy_runs';
  END IF;
  v_def := replace(v_def, v_old_summary, v_new_summary);

  IF position(v_old_return in v_def) = 0 THEN
    RAISE EXCEPTION 'Nie znaleziono oczekiwanego wyniku run_daily_economy';
  END IF;
  v_def := replace(v_def, v_old_return, v_new_return);

  EXECUTE v_def;

  REVOKE ALL ON FUNCTION public.run_daily_economy(date) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.run_daily_economy(date) TO authenticated, service_role;
END;
$inactive_country_payout$;

NOTIFY pgrst, 'reload schema';
