-- Ensure the region rename RPC exists in the Supabase migration stream.
-- The frontend calls this RPC when a country ruler renames a region.

create or replace function public.rename_region(
  p_region_id uuid,
  p_name text
)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_region public.regions%rowtype;
  v_name text := btrim(p_name);
  v_country_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Brak autoryzacji';
  end if;

  if v_name = '' then
    raise exception 'Nazwa regionu nie może być pusta';
  end if;
  if char_length(v_name) < 2 then
    raise exception 'Nazwa regionu musi mieć co najmniej 2 znaki';
  end if;
  if char_length(v_name) > 60 then
    raise exception 'Nazwa regionu może mieć maksymalnie 60 znaków';
  end if;

  select * into v_region
  from public.regions
  where id = p_region_id
  for update;

  if not found then
    raise exception 'Region nie istnieje';
  end if;

  select p.country_id into v_country_id
  from public.profiles p
  where p.id = auth.uid();

  if not public.is_admin(auth.uid()) and v_region.country_id <> v_country_id then
    raise exception 'Nie możesz zmienić nazwy tego regionu';
  end if;

  update public.regions
  set name = v_name
  where id = p_region_id;

  return json_build_object('ok', true, 'region_id', p_region_id, 'name', v_name);
end;
$function$;

grant execute on function public.rename_region(uuid, text) to authenticated;

notify pgrst, 'reload schema';
