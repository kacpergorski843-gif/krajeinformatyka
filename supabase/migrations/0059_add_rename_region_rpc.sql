-- 0059: add the region rename RPC used by the ruler-facing regions UI.
-- The previous frontend/type change referenced rename_region without creating it
-- in PostgreSQL, which caused PostgREST schema-cache errors.

create or replace function public.rename_region(
  p_region_id uuid,
  p_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_country_id uuid;
  v_name text;
begin
  v_name := btrim(p_name);

  if char_length(v_name) < 2 then
    raise exception 'Nazwa regionu musi mieć co najmniej 2 znaki';
  end if;

  if char_length(v_name) > 60 then
    raise exception 'Nazwa regionu może mieć maksymalnie 60 znaków';
  end if;

  select country_id
    into v_country_id
  from public.regions
  where id = p_region_id
  for update;

  if v_country_id is null then
    raise exception 'Nie znaleziono regionu';
  end if;

  perform public.assert_can_manage(v_country_id);

  update public.regions
  set name = v_name
  where id = p_region_id;

  return jsonb_build_object(
    'ok', true,
    'region_id', p_region_id,
    'name', v_name
  );
end;
$function$;

grant execute on function public.rename_region(uuid, text)
  to authenticated, service_role;

notify pgrst, 'reload schema';
