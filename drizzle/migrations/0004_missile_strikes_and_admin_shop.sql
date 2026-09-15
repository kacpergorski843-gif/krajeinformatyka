-- 1. Missile strike log
create table if not exists public.missile_strikes (
  id uuid primary key default gen_random_uuid(),
  attacker_country_id uuid references public.countries(id) on delete set null,
  defender_country_id uuid references public.countries(id) on delete set null,
  region_id uuid,
  region_name text not null default '',
  missile_code text not null,
  result text not null,
  aa_defense int not null default 0,
  destroyed jsonb not null default '[]'::jsonb,
  actor_id uuid,
  created_at timestamptz not null default now()
);

grant select on public.missile_strikes to authenticated;
grant all on public.missile_strikes to service_role;

alter table public.missile_strikes enable row level security;

drop policy if exists "strikes readable" on public.missile_strikes;
create policy "strikes readable" on public.missile_strikes
  for select to authenticated using (true);

create index if not exists missile_strikes_attacker_idx on public.missile_strikes (attacker_country_id, created_at desc);
create index if not exists missile_strikes_defender_idx on public.missile_strikes (defender_country_id, created_at desc);

-- 2. Precise shortage reporting when charging a country
create or replace function public.charge_country(p_country_id uuid, p_item public.shop_items, p_qty integer)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare c public.countries; v_missing text[] := '{}';
begin
  select * into c from public.countries where id = p_country_id for update;
  if c.id is null then raise exception 'Nie znaleziono państwa'; end if;

  if c.balance < p_item.cost_kr * p_qty then
    v_missing := v_missing || ('KR ' || trunc(c.balance)::text || ' / ' || trunc(p_item.cost_kr * p_qty)::text);
  end if;
  if c.coal < p_item.cost_coal * p_qty then
    v_missing := v_missing || ('WĘGIEL ' || trunc(c.coal)::text || ' / ' || trunc(p_item.cost_coal * p_qty)::text);
  end if;
  if c.oil < p_item.cost_oil * p_qty then
    v_missing := v_missing || ('ROPA ' || trunc(c.oil)::text || ' / ' || trunc(p_item.cost_oil * p_qty)::text);
  end if;
  if c.copper < p_item.cost_copper * p_qty then
    v_missing := v_missing || ('MIEDŹ ' || trunc(c.copper)::text || ' / ' || trunc(p_item.cost_copper * p_qty)::text);
  end if;
  if c.iron < p_item.cost_iron * p_qty then
    v_missing := v_missing || ('ŻELAZO ' || trunc(c.iron)::text || ' / ' || trunc(p_item.cost_iron * p_qty)::text);
  end if;
  if c.uranium < p_item.cost_uranium * p_qty then
    v_missing := v_missing || ('URAN ' || trunc(c.uranium)::text || ' / ' || trunc(p_item.cost_uranium * p_qty)::text);
  end if;

  if array_length(v_missing, 1) > 0 then
    raise exception 'Brak zasobów: %', array_to_string(v_missing, ', ');
  end if;

  update public.countries set
    balance = balance - p_item.cost_kr * p_qty,
    coal = coal - p_item.cost_coal * p_qty,
    oil = oil - p_item.cost_oil * p_qty,
    copper = copper - p_item.cost_copper * p_qty,
    iron = iron - p_item.cost_iron * p_qty,
    uranium = uranium - p_item.cost_uranium * p_qty
  where id = p_country_id;
end;
$function$;

-- 3. Missile launch
create or replace function public.launch_missile(
  p_country_id uuid,
  p_missile_code text,
  p_region_id uuid,
  p_slot_ids uuid[] default '{}',
  p_mode text default 'factories'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_def_country uuid; v_region_name text; v_def public.countries; v_att public.countries;
  v_needed int; v_threshold int; v_have int; v_intercepted boolean;
  v_targets uuid[]; v_destroyed jsonb := '[]'::jsonb; v_result text; v_label text;
begin
  if p_missile_code not in ('missile_1','missile_2','missile_3') then
    raise exception 'Nieprawidłowy typ rakiety';
  end if;
  perform public.assert_can_manage(p_country_id);

  select r.country_id, r.name into v_def_country, v_region_name
  from public.regions r where r.id = p_region_id;
  if v_def_country is null then raise exception 'Nie znaleziono regionu'; end if;
  if v_def_country = p_country_id then raise exception 'Nie możesz atakować własnego państwa'; end if;

  select * into v_att from public.countries where id = p_country_id for update;
  select * into v_def from public.countries where id = v_def_country for update;

  v_have := case p_missile_code
    when 'missile_1' then v_att.missile_1
    when 'missile_2' then v_att.missile_2
    else v_att.missile_3 end;
  if v_have < 1 then raise exception 'Nie masz tej rakiety w arsenale'; end if;

  v_threshold := case p_missile_code when 'missile_1' then 1 when 'missile_2' then 2 else 10 end;
  v_needed := case p_missile_code when 'missile_1' then 1 when 'missile_2' then 2 else 0 end;

  if p_missile_code = 'missile_3' then
    if p_mode not in ('factories','mines') then raise exception 'Wybierz fabryki albo wytwórnie'; end if;
    select coalesce(array_agg(s.id), '{}') into v_targets
    from public.region_slots s
    where s.region_id = p_region_id
      and ((p_mode = 'factories' and s.building::text like 'factory_%')
        or (p_mode = 'mines' and s.building::text like 'mine_%'));
    if array_length(v_targets, 1) is null then raise exception 'W tym regionie nie ma takich obiektów'; end if;
  else
    select coalesce(array_agg(s.id), '{}') into v_targets
    from public.region_slots s
    where s.region_id = p_region_id and s.id = any(p_slot_ids);
    if array_length(v_targets, 1) is null then raise exception 'Wybierz cel w regionie'; end if;
    if array_length(v_targets, 1) > v_needed then
      raise exception 'Ta rakieta niszczy maksymalnie % obiekt(y)', v_needed;
    end if;
  end if;

  -- rakieta zużywa się zawsze
  update public.countries set
    missile_1 = missile_1 - case when p_missile_code = 'missile_1' then 1 else 0 end,
    missile_2 = missile_2 - case when p_missile_code = 'missile_2' then 1 else 0 end,
    missile_3 = missile_3 - case when p_missile_code = 'missile_3' then 1 else 0 end
  where id = p_country_id;

  v_intercepted := v_def.aa_defense >= v_threshold;

  if v_intercepted then
    v_result := 'PRZECHWYCONA';
  else
    v_result := 'CEL ZNISZCZONY';
    select coalesce(jsonb_agg(jsonb_build_object('slot_id', s.id, 'slot_index', s.slot_index, 'building', s.building)), '[]'::jsonb)
      into v_destroyed
    from public.region_slots s where s.id = any(v_targets);
    delete from public.region_slots where id = any(v_targets);
  end if;

  insert into public.missile_strikes (attacker_country_id, defender_country_id, region_id, region_name,
    missile_code, result, aa_defense, destroyed, actor_id)
  values (p_country_id, v_def_country, p_region_id, v_region_name, p_missile_code, v_result,
    v_def.aa_defense, v_destroyed, auth.uid());

  v_label := 'Atak rakietowy na ' || v_def.name || ' (' || v_region_name || '): ' || v_result;
  insert into public.transactions (country_id, kind, label, amount_kr, actor_id, details)
  values (p_country_id, 'STRIKE', v_label, 0, auth.uid(),
    jsonb_build_object('missile', p_missile_code, 'region', v_region_name, 'result', v_result, 'destroyed', v_destroyed));

  insert into public.transactions (country_id, kind, label, amount_kr, actor_id, details)
  values (v_def_country, 'DEFENSE',
    'Atak rakietowy z ' || v_att.name || ' na region ' || v_region_name || ': ' || v_result,
    0, auth.uid(),
    jsonb_build_object('missile', p_missile_code, 'attacker', v_att.name, 'result', v_result, 'destroyed', v_destroyed));

  return jsonb_build_object('ok', true, 'result', v_result, 'destroyed', v_destroyed);
end;
$function$;

-- 4. Admin shop management
create or replace function public.admin_upsert_shop_item(p_item jsonb)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_code text := nullif(trim(p_item->>'code'), '');
begin
  if not public.is_admin(auth.uid()) then raise exception 'Brak uprawnień administratora'; end if;
  if v_code is null then raise exception 'Kod produktu jest wymagany'; end if;

  insert into public.shop_items (code, name, category, description, building, cost_kr, cost_coal,
    cost_oil, cost_copper, cost_iron, cost_uranium, income_kr, upkeep_coal, produces,
    produces_amount, sort_order, active)
  values (
    v_code,
    coalesce(nullif(p_item->>'name',''), v_code),
    coalesce(nullif(p_item->>'category',''), 'INNE'),
    coalesce(p_item->>'description',''),
    nullif(p_item->>'building','')::public.building_type,
    coalesce((p_item->>'cost_kr')::numeric, 0),
    coalesce((p_item->>'cost_coal')::numeric, 0),
    coalesce((p_item->>'cost_oil')::numeric, 0),
    coalesce((p_item->>'cost_copper')::numeric, 0),
    coalesce((p_item->>'cost_iron')::numeric, 0),
    coalesce((p_item->>'cost_uranium')::numeric, 0),
    coalesce((p_item->>'income_kr')::numeric, 0),
    coalesce((p_item->>'upkeep_coal')::numeric, 0),
    nullif(p_item->>'produces',''),
    coalesce((p_item->>'produces_amount')::numeric, 0),
    coalesce((p_item->>'sort_order')::int, 100),
    coalesce((p_item->>'active')::boolean, true)
  )
  on conflict (code) do update set
    name = coalesce(nullif(excluded.name,''), public.shop_items.name),
    category = excluded.category,
    description = excluded.description,
    building = excluded.building,
    cost_kr = excluded.cost_kr,
    cost_coal = excluded.cost_coal,
    cost_oil = excluded.cost_oil,
    cost_copper = excluded.cost_copper,
    cost_iron = excluded.cost_iron,
    cost_uranium = excluded.cost_uranium,
    income_kr = excluded.income_kr,
    upkeep_coal = excluded.upkeep_coal,
    produces = excluded.produces,
    produces_amount = excluded.produces_amount,
    sort_order = excluded.sort_order,
    active = excluded.active;

  insert into public.admin_actions (actor_id, action, details)
  values (auth.uid(), 'UPSERT_SHOP_ITEM', p_item);
  return v_code;
end;
$function$;

create or replace function public.admin_toggle_shop_item(p_code text, p_active boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_old boolean;
begin
  if not public.is_admin(auth.uid()) then raise exception 'Brak uprawnień administratora'; end if;
  select active into v_old from public.shop_items where code = p_code;
  if v_old is null then raise exception 'Nie znaleziono produktu'; end if;
  update public.shop_items set active = p_active where code = p_code;
  insert into public.admin_actions (actor_id, action, details)
  values (auth.uid(), 'TOGGLE_SHOP_ITEM',
    jsonb_build_object('code', p_code, 'old', jsonb_build_object('active', v_old),
                       'new', jsonb_build_object('active', p_active)));
  return jsonb_build_object('ok', true);
end;
$function$;

-- 5. Audit log with old/new values
create or replace function public.admin_adjust_country(p_country_id uuid, p_patch jsonb, p_note text default '')
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_before jsonb; v_after jsonb; v_old jsonb := '{}'::jsonb; v_new jsonb := '{}'::jsonb; k text;
begin
  if not public.is_admin(auth.uid()) then raise exception 'Brak uprawnień administratora'; end if;

  select to_jsonb(c) into v_before from public.countries c where c.id = p_country_id;
  if v_before is null then raise exception 'Nie znaleziono państwa'; end if;

  update public.countries set
    name = coalesce(p_patch->>'name', name),
    flag = coalesce(p_patch->>'flag', flag),
    balance = coalesce((p_patch->>'balance')::numeric, balance),
    coal = coalesce((p_patch->>'coal')::numeric, coal),
    oil = coalesce((p_patch->>'oil')::numeric, oil),
    copper = coalesce((p_patch->>'copper')::numeric, copper),
    iron = coalesce((p_patch->>'iron')::numeric, iron),
    uranium = coalesce((p_patch->>'uranium')::numeric, uranium),
    aa_defense = coalesce((p_patch->>'aa_defense')::int, aa_defense),
    missile_1 = coalesce((p_patch->>'missile_1')::int, missile_1),
    missile_2 = coalesce((p_patch->>'missile_2')::int, missile_2),
    missile_3 = coalesce((p_patch->>'missile_3')::int, missile_3),
    soldier_packs = coalesce((p_patch->>'soldier_packs')::int, soldier_packs),
    tank_packs = coalesce((p_patch->>'tank_packs')::int, tank_packs)
  where id = p_country_id;

  select to_jsonb(c) into v_after from public.countries c where c.id = p_country_id;

  for k in select jsonb_object_keys(p_patch) loop
    if v_before ? k and (v_before->k) is distinct from (v_after->k) then
      v_old := v_old || jsonb_build_object(k, v_before->k);
      v_new := v_new || jsonb_build_object(k, v_after->k);
    end if;
  end loop;

  insert into public.admin_actions (actor_id, country_id, action, details)
  values (auth.uid(), p_country_id, 'ADJUST_COUNTRY',
    jsonb_build_object('old', v_old, 'new', v_new, 'note', p_note));

  insert into public.transactions (country_id, kind, label, amount_kr, actor_id, details)
  values (p_country_id, 'ADMIN', 'Korekta administracyjna',
    coalesce((v_new->>'balance')::numeric, 0) - coalesce((v_old->>'balance')::numeric, 0),
    auth.uid(), jsonb_build_object('old', v_old, 'new', v_new, 'note', p_note));

  return jsonb_build_object('ok', true, 'old', v_old, 'new', v_new);
end;
$function$;
