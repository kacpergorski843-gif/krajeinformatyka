ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username text;

UPDATE public.profiles SET username = coalesce(username, display_name, split_part(coalesce(email,''),'@',1));

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_idx ON public.profiles (lower(username));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare v_username text;
begin
  v_username := coalesce(
    new.raw_user_meta_data->>'username',
    new.raw_user_meta_data->>'display_name',
    split_part(new.email,'@',1)
  );
  insert into public.profiles (id, email, display_name, username)
  values (new.id, new.email, v_username, v_username)
  on conflict (id) do nothing;
  insert into public.user_roles (user_id, role) values (new.id, 'PLAYER')
  on conflict do nothing;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.username_taken(p_username text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.profiles where lower(username) = lower(trim(p_username)));
$function$;

GRANT EXECUTE ON FUNCTION public.username_taken(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE(id uuid, email text, display_name text, country_id uuid, country_name text, role app_role)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select p.id, p.email, coalesce(p.username, p.display_name), p.country_id, c.name,
         (select ur.role from public.user_roles ur where ur.user_id = p.id order by ur.role desc limit 1)
  from public.profiles p
  left join public.countries c on c.id = p.country_id
  where public.is_admin(auth.uid())
  order by p.created_at;
$function$;