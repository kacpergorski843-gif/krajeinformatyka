-- Restore original user-entered display names for existing accounts.
-- Authentication may use a normalized username, but the visible name should
-- preserve Polish characters, spaces and other supported characters.

update public.profiles p
set display_name = u.raw_user_meta_data->>'display_name'
from auth.users u
where u.id = p.id
  and nullif(trim(u.raw_user_meta_data->>'display_name'), '') is not null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_username text;
  v_display_name text;
begin
  v_username := coalesce(
    new.raw_user_meta_data->>'username',
    new.raw_user_meta_data->>'display_name',
    split_part(new.email,'@',1)
  );
  v_display_name := coalesce(
    new.raw_user_meta_data->>'display_name',
    v_username
  );

  insert into public.profiles (id, email, display_name, username)
  values (new.id, new.email, v_display_name, v_username)
  on conflict (id) do update
    set email = excluded.email,
        display_name = coalesce(excluded.display_name, public.profiles.display_name),
        username = coalesce(excluded.username, public.profiles.username);

  insert into public.user_roles (user_id, role) values (new.id, 'PLAYER')
  on conflict do nothing;
  return new;
end;
$function$;

notify pgrst, 'reload schema';
