-- Ensure every newly created player profile has an activity baseline.
-- The authenticated app heartbeat immediately advances this timestamp on entry,
-- without requiring a sign-out/sign-in cycle.

create or replace function public.initialize_player_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  insert into public.player_activity (user_id, last_seen_at)
  values (new.id, now())
  on conflict (user_id) do nothing;
  return new;
end;
$function$;

drop trigger if exists initialize_player_activity_after_profile_insert on public.profiles;
create trigger initialize_player_activity_after_profile_insert
after insert on public.profiles
for each row
execute function public.initialize_player_activity();

-- Backfill any profile that may have been created between earlier migrations.
insert into public.player_activity (user_id, last_seen_at)
select p.id, coalesce(u.last_sign_in_at, u.created_at, now())
from public.profiles p
join auth.users u on u.id = p.id
on conflict (user_id) do nothing;

notify pgrst, 'reload schema';
