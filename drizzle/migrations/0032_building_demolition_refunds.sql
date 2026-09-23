-- Building demolition refund policy:
-- 100% refund during the first 24 hours after construction, then 75%.
-- Refunds are applied at the database boundary so the rule cannot be bypassed
-- by changing the client UI.

alter table public.region_slots
  add column if not exists built_at timestamptz;

-- Existing buildings predate this policy; treat them as older than 24h.
update public.region_slots
set built_at = now() - interval '25 hours'
where built_at is null;

alter table public.region_slots
  alter column built_at set default now();

alter table public.region_slots
  alter column built_at set not null;

create or replace function public.refund_player_on_building_demolition()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_user_role text;
  v_country_id uuid;
  v_item public.shop_items;
  v_multiplier numeric;
begin
  -- Administrators and system operations never receive player refunds.
  select ur.role::text
    into v_user_role
  from public.user_roles ur
  where ur.user_id = auth.uid()
    and ur.role = 'PLAYER'
  limit 1;

  if v_user_role is null then
    return OLD;
  end if;

  select r.country_id
    into v_country_id
  from public.regions r
  where r.id = OLD.region_id;

  if v_country_id is null then
    return OLD;
  end if;

  select *
    into v_item
  from public.shop_items si
  where si.building = OLD.building
  order by si.active desc, si.sort_order asc
  limit 1;

  if v_item.building is null then
    return OLD;
  end if;

  v_multiplier := case
    when OLD.built_at >= now() - interval '24 hours' then 1.0
    else 0.75
  end;

  update public.countries
  set
    balance = balance + (v_item.cost_kr * v_multiplier),
    coal = coal + (v_item.cost_coal * v_multiplier),
    oil = oil + (v_item.cost_oil * v_multiplier),
    copper = copper + (v_item.cost_copper * v_multiplier),
    iron = iron + (v_item.cost_iron * v_multiplier),
    uranium = uranium + (v_item.cost_uranium * v_multiplier)
  where id = v_country_id;

  return OLD;
end;
$function$;

drop trigger if exists region_slots_player_demolition_refund on public.region_slots;

create trigger region_slots_player_demolition_refund
before delete on public.region_slots
for each row
execute function public.refund_player_on_building_demolition();

revoke all on function public.refund_player_on_building_demolition() from public;
grant execute on function public.refund_player_on_building_demolition() to authenticated;
grant execute on function public.refund_player_on_building_demolition() to service_role;

notify pgrst, 'reload schema';
