-- Restore the admin user listing RPC in the Supabase migration stream.
-- The function was present in the legacy Drizzle migrations but not in the
-- active Supabase migrations, which caused the Administration > Users tab to fail.
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE(
  id uuid,
  email text,
  display_name text,
  country_id uuid,
  country_name text,
  role public.app_role
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT
    p.id,
    p.email,
    COALESCE(u.raw_user_meta_data->>'display_name', p.display_name, p.username),
    p.country_id,
    c.name,
    (
      SELECT ur.role
      FROM public.user_roles ur
      WHERE ur.user_id = p.id
      ORDER BY ur.role DESC
      LIMIT 1
    )
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  LEFT JOIN public.countries c ON c.id = p.country_id
  WHERE public.is_admin(auth.uid())
  ORDER BY p.created_at;
$function$;

REVOKE ALL ON FUNCTION public.admin_list_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
