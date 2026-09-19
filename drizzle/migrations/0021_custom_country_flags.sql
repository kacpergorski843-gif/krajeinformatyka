-- CUSTOM COUNTRY FLAGS VIA SUPABASE STORAGE -----------------------
-- Stores uploaded flag images in a public bucket. Only admins can write;
-- everyone authenticated can read the public flag files.

insert into storage.buckets (id, name, public)
values ('country-flags', 'country-flags', true)
on conflict (id) do update set public = true;

drop policy if exists "country flags public read" on storage.objects;
create policy "country flags public read"
on storage.objects
for select
to public
using (bucket_id = 'country-flags');

drop policy if exists "country flags admin insert" on storage.objects;
create policy "country flags admin insert"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'country-flags' and public.is_admin(auth.uid()));

drop policy if exists "country flags admin update" on storage.objects;
create policy "country flags admin update"
on storage.objects
for update
to authenticated
using (bucket_id = 'country-flags' and public.is_admin(auth.uid()))
with check (bucket_id = 'country-flags' and public.is_admin(auth.uid()));

drop policy if exists "country flags admin delete" on storage.objects;
create policy "country flags admin delete"
on storage.objects
for delete
to authenticated
using (bucket_id = 'country-flags' and public.is_admin(auth.uid()));

create or replace function public.admin_set_country_flag(
  p_country_id uuid,
  p_flag text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Brak uprawnień administratora';
  end if;

  if p_country_id is null then
    raise exception 'Nie wybrano państwa';
  end if;

  if not exists (select 1 from public.countries where id = p_country_id) then
    raise exception 'Nie znaleziono państwa';
  end if;

  update public.countries
  set flag = coalesce(nullif(trim(p_flag), ''), '')
  where id = p_country_id;
end;
$$;

grant execute on function public.admin_set_country_flag(uuid, text) to authenticated;
