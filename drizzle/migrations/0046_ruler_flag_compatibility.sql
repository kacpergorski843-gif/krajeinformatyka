-- 0046: compatibility for older deployed ruler-flag handlers.
-- Keep the function available while clients/server bundles roll forward.

create or replace function public.can_change_country_flag(
  p_country_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and country_id = p_country_id
  );
$$;

revoke execute on function public.can_change_country_flag(uuid) from public, anon;
grant execute on function public.can_change_country_flag(uuid) to authenticated;

notify pgrst, 'reload schema';
