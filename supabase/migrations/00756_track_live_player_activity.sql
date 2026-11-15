-- Create the live activity heartbeat used by daily payout eligibility.
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

insert into public.player_activity (user_id, last_seen_at)
select id, coalesce(last_sign_in_at, created_at)
from auth.users
on conflict (user_id) do nothing;

create index if not exists player_activity_last_seen_idx
  on public.player_activity (last_seen_at);

notify pgrst, 'reload schema';
