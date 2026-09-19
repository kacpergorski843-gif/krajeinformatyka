-- Security hardening: prevent client-side privilege escalation through profile updates
-- and limit occupation history to users who are actually involved in the region.

revoke update on table public.profiles from authenticated;
grant update (display_name) on table public.profiles to authenticated;

drop policy if exists "profiles update self name" on public.profiles;
create policy "profiles update self name"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists region_occupations_authenticated_read on public.region_occupations;
create policy region_occupations_authenticated_read
  on public.region_occupations
  for select
  to authenticated
  using (
    public.is_admin(auth.uid())
    or previous_country_id = public.my_country_id()
    or current_country_id = public.my_country_id()
  );

revoke insert, update, delete on table public.region_occupations from authenticated;
grant select on table public.region_occupations to authenticated;
