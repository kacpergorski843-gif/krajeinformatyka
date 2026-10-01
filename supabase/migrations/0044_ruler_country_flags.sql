-- Allow country rulers to upload and assign their own flag.
-- This lives in Supabase migrations as well as the Drizzle SQL because the
-- project currently has a stale Drizzle migration journal after 0006.

create or replace function public.ruler_set_country_flag(
  p_country_id uuid,
  p_flag text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Brak autoryzacji';
  end if;

  if p_country_id is null then
    raise exception 'Nie wybrano państwa';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.country_id = p_country_id
  ) then
    raise exception 'Możesz zmienić flagę tylko swojego państwa';
  end if;

  if not exists (select 1 from public.countries where id = p_country_id) then
    raise exception 'Nie znaleziono państwa';
  end if;

  update public.countries
  set flag = coalesce(nullif(trim(p_flag), ''), '')
  where id = p_country_id;
end;
$$;

grant execute on function public.ruler_set_country_flag(uuid, text) to authenticated;

-- Keep the existing admin policies and add a ruler policy. The client already
-- validates image type and size; the database additionally restricts the path
-- to the ruler's own country directory.
drop policy if exists "country flags ruler insert" on storage.objects;
create policy "country flags ruler insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'country-flags'
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.country_id::text = split_part(name, '/', 1)
  )
);

drop policy if exists "country flags ruler update" on storage.objects;
create policy "country flags ruler update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'country-flags'
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.country_id::text = split_part(name, '/', 1)
  )
)
with check (
  bucket_id = 'country-flags'
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.country_id::text = split_part(name, '/', 1)
  )
);

notify pgrst, 'reload schema';
