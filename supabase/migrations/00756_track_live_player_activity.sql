-- Track real in-game presence instead of relying on auth.users.last_sign_in_at.
-- A visible authenticated game tab refreshes its heartbeat every minute.
create table if not exists public.player_activity (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_seen_at timestamptz not null default now()
);

alter table public.player_activity enable row level security;
revoke all on public.player_activity from public, anon;
grant select, insert, update on public.player_activity to authenticated;

drop policy if exists "Players can read their own activity" on public.player_activity;
create policy "Players can read their own activity"
  on public.player_activity for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Players can insert their own activity" on public.player_activity;
create policy "Players can insert their own activity"
  on public.player_activity for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Players can update their own activity" on public.player_activity;
create policy "Players can update their own activity"
  on public.player_activity for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists player_activity_last_seen_idx
  on public.player_activity (last_seen_at);

-- Migration 00755 installs the inactivity filter by patching the existing
-- run_daily_economy function. Replace its sign-in timestamp source with the
-- live heartbeat table, preserving the rest of the installed function body.
do $$
declare
  v_def text;
  v_pattern text := 'max\(coalesce\(u\.last_sign_in_at, u\.created_at\)\)[[:space:]]+as last_activity_at[[:space:]]+from public\.profiles p[[:space:]]+join auth\.users u on u\.id = p\.id[[:space:]]+where p\.country_id is not null[[:space:]]+group by p\.country_id';
  v_replacement text := 'max(pa.last_seen_at) as last_activity_at
      from public.profiles p
      join public.player_activity pa on pa.user_id = p.id
      where p.country_id is not null
      group by p.country_id';
begin
  v_def := pg_get_functiondef('public.run_daily_economy(date)'::regprocedure);

  if v_def !~* v_pattern then
    if position('public.player_activity pa' in v_def) > 0 then
      raise notice 'run_daily_economy already uses player_activity; no function change needed';
      return;
    end if;
    raise exception 'Nie znaleziono filtra nieaktywnych krajów z migracji 00755. Najpierw zastosuj poprawioną migrację 00755, a następnie 00756.';
  end if;

  v_def := regexp_replace(v_def, v_pattern, v_replacement, 'i');
  execute v_def;
end;
$$;

notify pgrst, 'reload schema';
