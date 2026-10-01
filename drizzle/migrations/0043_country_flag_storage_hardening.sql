-- 0043: harden custom country flag storage and admin update.
-- Re-establish the public bucket and admin-only write policies so flag uploads
-- continue to work even if storage policies were changed or recreated.

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
with check (
  bucket_id = 'country-flags'
  and public.is_admin((select auth.uid()))
);

drop policy if exists "country flags admin update" on storage.objects;
create policy "country flags admin update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'country-flags'
  and public.is_admin((select auth.uid()))
)
with check (
  bucket_id = 'country-flags'
  and public.is_admin((select auth.uid()))
);

drop policy if exists "country flags admin delete" on storage.objects;
create policy "country flags admin delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'country-flags'
  and public.is_admin((select auth.uid()))
);

create or replace function public.admin_set_country_flag(
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

  if not public.is_admin(auth.uid()) then
    raise exception 'Brak uprawnień administratora';
  end if;

  if p_country_id is null then
    raise exception 'Nie wybrano państwa';
  end if;

  if coalesce(trim(p_flag), '') = '' then
    raise exception 'Nieprawidłowy adres flagi';
  end if;

  if length(p_flag) > 2048 then
    raise exception 'Adres flagi jest za długi';
  end if;

  if not exists (
    select 1 from public.countries where id = p_country_id
  ) then
    raise exception 'Nie znaleziono państwa';
  end if;

  update public.countries
  set flag = trim(p_flag)
  where id = p_country_id;

  if not found then
    raise exception 'Nie udało się zapisać flagi';
  end if;
end;
$function$;

revoke execute on function public.admin_set_country_flag(uuid, text) from public, anon;
grant execute on function public.admin_set_country_flag(uuid, text) to authenticated, service_role;

notify pgrst, 'reload schema';
