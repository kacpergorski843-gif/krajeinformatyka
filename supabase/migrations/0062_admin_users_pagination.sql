-- 0062: paginate admin users server-side so the admin panel never loads the entire user table.
create or replace function public.admin_list_users_page(
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table(
  id uuid,
  email text,
  display_name text,
  country_id uuid,
  country_name text,
  role public.app_role,
  total_count bigint
)
language sql
stable
security definer
set search_path = public
as $function$
  select
    p.id,
    p.email,
    p.display_name,
    p.country_id,
    c.name,
    coalesce(ur.role, 'PLAYER'::public.app_role) as role,
    count(*) over() as total_count
  from public.profiles p
  left join public.countries c on c.id = p.country_id
  left join lateral (
    select r.role
    from public.user_roles r
    where r.user_id = p.id
    order by case r.role
      when 'MAIN_ADMIN'::public.app_role then 1
      when 'ADMIN'::public.app_role then 2
      else 3
    end
    limit 1
  ) ur on true
  where public.is_admin(auth.uid())
    and (
      nullif(btrim(p_search), '') is null
      or concat_ws(' ', p.display_name, p.email, c.name) ilike '%' || btrim(p_search) || '%'
    )
  order by p.display_name nulls last, p.email nulls last
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$function$;

create or replace function public.admin_user_summary()
returns table(total_users bigint, assigned_users bigint)
language sql
stable
security definer
set search_path = public
as $function$
  select
    count(*)::bigint,
    count(*) filter (where p.country_id is not null)::bigint
  from public.profiles p
  where public.is_admin(auth.uid());
$function$;

create or replace function public.admin_country_owners()
returns table(country_id uuid, user_id uuid, display_name text)
language sql
stable
security definer
set search_path = public
as $function$
  select distinct on (p.country_id)
    p.country_id,
    p.id,
    p.display_name
  from public.profiles p
  where public.is_admin(auth.uid())
    and p.country_id is not null
  order by p.country_id, p.display_name nulls last, p.id;
$function$;

grant execute on function public.admin_list_users_page(text, integer, integer) to authenticated, service_role;
grant execute on function public.admin_user_summary() to authenticated, service_role;
grant execute on function public.admin_country_owners() to authenticated, service_role;

notify pgrst, 'reload schema';
