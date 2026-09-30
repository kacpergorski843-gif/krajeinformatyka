-- Show the original display name in the admin user list.
-- The login username stays normalized for authentication, while display_name
-- preserves Polish characters and other user-entered text.

create or replace function public.admin_list_users()
returns table(id uuid, email text, display_name text, country_id uuid, country_name text, role public.app_role)
language sql
stable security definer
set search_path = public
as $function$
  select p.id, p.email, coalesce(u.raw_user_meta_data->>'display_name', p.display_name, p.username), p.country_id, c.name,
         (select ur.role from public.user_roles ur where ur.user_id = p.id order by ur.role desc limit 1)
  from public.profiles p
  left join auth.users u on u.id = p.id
  left join public.countries c on c.id = p.country_id
  where public.is_admin(auth.uid())
  order by p.created_at;
$function$;

notify pgrst, 'reload schema';
