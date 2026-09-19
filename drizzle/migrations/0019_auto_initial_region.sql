-- AUTOMATIC INITIAL REGION ------------------------------------------
-- Every newly created country receives exactly one initial region.
-- This is database-level so it applies regardless of which UI/RPC creates the country.

create or replace function public.create_initial_country_region()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.regions (country_id, name)
  values (new.id, 'Region 1');

  return new;
end;
$$;

drop trigger if exists trg_create_initial_country_region on public.countries;

create trigger trg_create_initial_country_region
after insert on public.countries
for each row
execute function public.create_initial_country_region();
