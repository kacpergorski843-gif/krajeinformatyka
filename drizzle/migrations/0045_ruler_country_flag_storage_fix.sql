-- 0045: make ruler flag uploads use the same Storage path as admin uploads,
-- while restricting the ruler to their own country. The ownership check is
-- security-definer so profiles RLS cannot block the Storage policy.

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
    from public.profiles p
    where p.id = auth.uid()
      and p.country_id = p_country_id
  );
$$;

revoke execute on function public.can_change_country_flag(uuid) from public, anon;
grant execute on function public.can_change_country_flag(uuid) to authenticated;

drop policy if exists "country flags ruler insert" on storage.objects;
create policy "country flags ruler insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'country-flags'
  and public.can_change_country_flag(
    nullif(split_part(name, '/', 1), '')::uuid
  )
);

drop policy if exists "country flags ruler update" on storage.objects;
create policy "country flags ruler update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'country-flags'
  and public.can_change_country_flag(
    nullif(split_part(name, '/', 1), '')::uuid
  )
)
with check (
  bucket_id = 'country-flags'
  and public.can_change_country_flag(
    nullif(split_part(name, '/', 1), '')::uuid
  )
);

create or replace function public.ruler_set_country_flag(
  p_country_id uuid,
  p_flag text
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
begin
  if auth.uid() is null then
    raise exception 'Brak autoryzacji';
  end if;

  if not public.can_change_country_flag(p_country_id) then
    raise exception 'Możesz zmienić flagę tylko swojego państwa';
  end if;

  if coalesce(trim(p_flag), '') = '' then
    raise exception 'Nieprawidłowy adres flagi';
  end if;

  if not exists (
    select 1 from public.countries where id = p_country_id
  ) then
    raise exception 'Nie znaleziono państwa';
  end if;

  update public.countries
  set flag = trim(p_flag)
  where id = p_country_id;
end;
$function$;

revoke execute on function public.ruler_set_country_flag(uuid, text) from public, anon;
grant execute on function public.ruler_set_country_flag(uuid, text) to authenticated, service_role;

notify pgrst, 'reload schema';
