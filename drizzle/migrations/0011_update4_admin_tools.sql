-- UPDATE 4.0: admin operations — building grant, region occupation, temporary income bonus.
create table if not exists public.economy_bonuses (
  id uuid primary key default gen_random_uuid(),
  percent numeric not null check (percent > 0 and percent <= 1000),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

alter table public.economy_bonuses enable row level security;
drop policy if exists economy_bonuses_public_read on public.economy_bonuses;
create policy economy_bonuses_public_read on public.economy_bonuses for select to authenticated using (true);

create or replace function public.admin_grant_building(
  p_country_id uuid, p_region_id uuid, p_slot_index smallint, p_building text, p_quantity integer default 1
) returns jsonb language plpgsql security definer set search_path=public as $function$
declare v_role text; v_item public.shop_items; v_i int;
begin
  select role::text into v_role from public.user_roles where user_id=auth.uid() and role in ('ADMIN','MAIN_ADMIN') order by role desc limit 1;
  if v_role is null then raise exception 'Brak uprawnień administratora'; end if;
  if p_quantity < 1 or p_quantity > 9 then raise exception 'Nieprawidłowa ilość'; end if;
  if not exists(select 1 from public.regions where id=p_region_id and country_id=p_country_id) then raise exception 'Region nie należy do państwa'; end if;
  select * into v_item from public.shop_items where building=p_building::building_type and active limit 1;
  if v_item.building is null then raise exception 'Nie znaleziono budynku'; end if;
  for v_i in 0..p_quantity-1 loop
    insert into public.region_slots(region_id,slot_index,building)
    values(p_region_id,p_slot_index+v_i,p_building::building_type)
    on conflict do nothing;
  end loop;
  insert into public.admin_actions(action,country_id,details,actor_id)
  values('GRANT_BUILDING',p_country_id,jsonb_build_object('region_id',p_region_id,'slot',p_slot_index,'building',p_building,'quantity',p_quantity),auth.uid());
  return jsonb_build_object('ok',true);
end;
$function$;

create or replace function public.admin_occupy_region(p_region_id uuid,p_new_country_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $function$
declare v_role text; v_old uuid;
begin
  select role::text into v_role from public.user_roles where user_id=auth.uid() and role in ('ADMIN','MAIN_ADMIN') order by role desc limit 1;
  if v_role is null then raise exception 'Brak uprawnień administratora'; end if;
  select country_id into v_old from public.regions where id=p_region_id for update;
  if v_old is null then raise exception 'Nie znaleziono regionu'; end if;
  if not exists(select 1 from public.countries where id=p_new_country_id) then raise exception 'Nie znaleziono kraju przejmującego'; end if;
  update public.regions set country_id=p_new_country_id where id=p_region_id;
  insert into public.admin_actions(action,country_id,details,actor_id)
  values('OCCUPY_REGION',p_new_country_id,jsonb_build_object('region_id',p_region_id,'previous_country_id',v_old,'new_country_id',p_new_country_id,'occupied_at',now()),auth.uid());
  return jsonb_build_object('ok',true,'previous_country_id',v_old,'new_country_id',p_new_country_id);
end;
$function$;

create or replace function public.admin_start_income_bonus(p_percent numeric,p_hours numeric)
returns jsonb language plpgsql security definer set search_path=public as $function$
declare v_role text; v_id uuid;
begin
  select role::text into v_role from public.user_roles where user_id=auth.uid() and role in ('ADMIN','MAIN_ADMIN') order by role desc limit 1;
  if v_role is null then raise exception 'Brak uprawnień administratora'; end if;
  if p_percent <= 0 or p_percent > 1000 or p_hours <= 0 or p_hours > 720 then raise exception 'Nieprawidłowy bonus lub czas'; end if;
  insert into public.economy_bonuses(percent,starts_at,ends_at,created_by)
  values(p_percent,now(),now() + make_interval(hours=>p_hours)) returning id into v_id;
  insert into public.admin_actions(action,details,actor_id)
  values('INCOME_BONUS',jsonb_build_object('bonus_id',v_id,'percent',p_percent,'hours',p_hours),auth.uid());
  return jsonb_build_object('ok',true,'id',v_id);
end;
$function$;

grant execute on function public.admin_grant_building(uuid,uuid,smallint,text,integer) to authenticated;
grant execute on function public.admin_occupy_region(uuid,uuid) to authenticated;
grant execute on function public.admin_start_income_bonus(numeric,numeric) to authenticated;
