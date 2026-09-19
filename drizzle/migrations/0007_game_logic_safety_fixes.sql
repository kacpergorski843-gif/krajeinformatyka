-- UPDATE 3.6: fixes for regional AA source of truth and admin race conditions
--
-- This migration intentionally keeps existing migrations untouched.
-- All fixes are additive/redefinitions so already-applied databases can upgrade safely.

-- 1. Regional AA is the only mutable source of truth.
-- Repair any legacy drift before replacing the mutating functions.
update public.countries c
set aa_defense = coalesce((
  select sum(r.aa_defense)
  from public.regions r
  where r.country_id = c.id
), 0);

alter table public.regions
  drop constraint if exists regions_aa_defense_nonnegative;
alter table public.regions
  add constraint regions_aa_defense_nonnegative
  check (aa_defense >= 0);

-- Purchase AA only changes the selected region. The trigger from 0006
-- synchronizes countries.aa_defense automatically.
create or replace function public.purchase_aa(
  p_country_id uuid,
  p_region_id uuid,
  p_qty integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_item public.shop_items;
  v_region public.regions;
begin
  if p_qty is null or p_qty < 1 or p_qty > 1000 then
    raise exception 'Nieprawidłowa ilość';
  end if;

  perform public.assert_can_manage(p_country_id);

  select * into v_region
  from public.regions
  where id = p_region_id
  for update;

  if v_region.id is null then raise exception 'Nie znaleziono regionu'; end if;
  if v_region.country_id <> p_country_id then
    raise exception 'Ten region nie należy do twojego państwa';
  end if;

  select * into v_item
  from public.shop_items
  where code = 'aa' and active;

  if v_item.code is null then raise exception 'OPL nie jest dostępne w sklepie'; end if;

  perform public.charge_country(p_country_id, v_item, p_qty);

  update public.regions
  set aa_defense = aa_defense + p_qty
  where id = p_region_id;

  insert into public.transactions (
    country_id, kind, label, amount_kr, actor_id, details
  )
  values (
    p_country_id,
    'PURCHASE',
    'Zakup: OPL x' || p_qty || ' (' || v_region.name || ')',
    -(v_item.cost_kr * p_qty),
    auth.uid(),
    jsonb_build_object(
      'item', 'aa',
      'qty', p_qty,
      'region_id', p_region_id,
      'region', v_region.name
    )
  );

  return jsonb_build_object(
    'ok', true,
    'region_aa', v_region.aa_defense + p_qty
  );
end;
$function$;

grant execute on function public.purchase_aa(uuid, uuid, integer) to authenticated;

-- Missile resolution uses the AA value of the target region.
-- Country AA remains a derived aggregate and is never manually changed here.
-- Country rows are locked in deterministic UUID order to avoid A->B / B->A
-- lock-order deadlocks during simultaneous attacks.
create or replace function public.launch_missile(
  p_country_id uuid,
  p_missile_code text,
  p_region_id uuid,
  p_slot_ids uuid[] default '{}'::uuid[],
  p_mode text default 'factories'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_region public.regions;
  v_def public.countries;
  v_att public.countries;
  v_needed int;
  v_required_aa int;
  v_have int;
  v_intercepted boolean;
  v_targets uuid[];
  v_destroyed jsonb := '[]'::jsonb;
  v_result text;
  v_label text;
begin
  if p_missile_code not in ('missile_1','missile_2','missile_3') then
    raise exception 'Nieprawidłowy typ rakiety';
  end if;

  perform public.assert_can_manage(p_country_id);

  select * into v_region
  from public.regions
  where id = p_region_id
  for update;

  if v_region.id is null then raise exception 'Nie znaleziono regionu'; end if;
  if v_region.country_id = p_country_id then
    raise exception 'Nie możesz atakować własnego państwa';
  end if;

  -- Always lock the two country rows in the same order.
  if p_country_id::text < v_region.country_id::text then
    select * into v_att from public.countries where id = p_country_id for update;
    select * into v_def from public.countries where id = v_region.country_id for update;
  else
    select * into v_def from public.countries where id = v_region.country_id for update;
    select * into v_att from public.countries where id = p_country_id for update;
  end if;

  v_have := case p_missile_code
    when 'missile_1' then v_att.missile_1
    when 'missile_2' then v_att.missile_2
    else v_att.missile_3
  end;

  if v_have < 1 then raise exception 'Nie masz tej rakiety w arsenale'; end if;

  v_required_aa := case p_missile_code
    when 'missile_1' then 1
    when 'missile_2' then 2
    else 10
  end;

  v_needed := case p_missile_code
    when 'missile_1' then 1
    when 'missile_2' then 2
    else 0
  end;

  if p_missile_code = 'missile_3' then
    if p_mode not in ('factories','mines') then
      raise exception 'Wybierz fabryki albo zakłady surowcowe';
    end if;

    select coalesce(array_agg(s.id), '{}')
    into v_targets
    from public.region_slots s
    where s.region_id = p_region_id
      and (
        (p_mode = 'factories' and s.building::text like 'factory_%')
        or
        (p_mode = 'mines' and s.building::text like 'mine_%')
      );

    if array_length(v_targets, 1) is null then
      raise exception 'W tym regionie nie ma takich obiektów';
    end if;
  else
    select coalesce(array_agg(s.id), '{}')
    into v_targets
    from public.region_slots s
    where s.region_id = p_region_id
      and s.id = any(p_slot_ids);

    if array_length(v_targets, 1) is null then
      raise exception 'Wybierz cel w regionie';
    end if;

    if array_length(v_targets, 1) > v_needed then
      raise exception 'Ta rakieta niszczy maksymalnie % obiekt(y)', v_needed;
    end if;
  end if;

  -- The missile is consumed regardless of interception.
  update public.countries
  set
    missile_1 = missile_1 - case when p_missile_code = 'missile_1' then 1 else 0 end,
    missile_2 = missile_2 - case when p_missile_code = 'missile_2' then 1 else 0 end,
    missile_3 = missile_3 - case when p_missile_code = 'missile_3' then 1 else 0 end
  where id = p_country_id;

  v_intercepted := v_region.aa_defense >= v_required_aa;

  if v_intercepted then
    v_result := 'PRZECHWYCONA';

    update public.regions
    set aa_defense = aa_defense - v_required_aa
    where id = p_region_id;
  else
    v_result := 'CEL ZNISZCZONY';

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'slot_id', s.id,
          'slot_index', s.slot_index,
          'building', s.building
        )
      ),
      '[]'::jsonb
    )
    into v_destroyed
    from public.region_slots s
    where s.id = any(v_targets);

    delete from public.region_slots
    where id = any(v_targets);
  end if;

  insert into public.missile_strikes (
    attacker_country_id,
    defender_country_id,
    region_id,
    region_name,
    missile_code,
    result,
    aa_defense,
    destroyed,
    actor_id,
    region_aa,
    required_aa
  )
  values (
    p_country_id,
    v_region.country_id,
    p_region_id,
    v_region.name,
    p_missile_code,
    v_result,
    v_region.aa_defense,
    v_destroyed,
    auth.uid(),
    case when v_intercepted
      then greatest(v_region.aa_defense - v_required_aa, 0)
      else v_region.aa_defense
    end,
    v_required_aa
  );

  v_label := 'Atak rakietowy na ' || v_def.name || ' (' ||
    v_region.name || '): ' || v_result;

  insert into public.transactions (
    country_id, kind, label, amount_kr, actor_id, details
  )
  values (
    p_country_id,
    'STRIKE',
    v_label,
    0,
    auth.uid(),
    jsonb_build_object(
      'missile', p_missile_code,
      'region', v_region.name,
      'result', v_result,
      'destroyed', v_destroyed,
      'required_aa', v_required_aa,
      'region_aa', case when v_intercepted
        then greatest(v_region.aa_defense - v_required_aa, 0)
        else v_region.aa_defense
      end
    )
  );

  insert into public.transactions (
    country_id, kind, label, amount_kr, actor_id, details
  )
  values (
    v_region.country_id,
    'DEFENSE',
    'Atak rakietowy z ' || v_att.name || ' na region ' ||
      v_region.name || ': ' || v_result,
    0,
    auth.uid(),
    jsonb_build_object(
      'missile', p_missile_code,
      'attacker', v_att.name,
      'result', v_result,
      'destroyed', v_destroyed,
      'required_aa', v_required_aa,
      'region_aa', case when v_intercepted
        then greatest(v_region.aa_defense - v_required_aa, 0)
        else v_region.aa_defense
      end
    )
  );

  return jsonb_build_object(
    'ok', true,
    'result', v_result,
    'destroyed', v_destroyed,
    'required_aa', v_required_aa,
    'region_aa', case when v_intercepted
      then greatest(v_region.aa_defense - v_required_aa, 0)
      else v_region.aa_defense
    end
  );
end;
$function$;

grant execute on function public.launch_missile(uuid, text, uuid, uuid[], text) to authenticated;

-- 2. Admin country corrections cannot directly overwrite derived country AA.
-- Existing clients that still include aa_defense are accepted, but the value
-- is ignored and the aggregate is re-synced from regions.
create or replace function public.admin_adjust_country(
  p_country_id uuid,
  p_patch jsonb,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_before jsonb;
  v_after jsonb;
  v_old jsonb := '{}'::jsonb;
  v_new jsonb := '{}'::jsonb;
  v_patch jsonb;
  k text;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Brak uprawnień administratora';
  end if;

  v_patch := p_patch - 'aa_defense';

  select to_jsonb(c) into v_before
  from public.countries c
  where c.id = p_country_id;

  if v_before is null then raise exception 'Nie znaleziono państwa'; end if;

  update public.countries set
    name = coalesce(v_patch->>'name', name),
    flag = coalesce(v_patch->>'flag', flag),
    balance = coalesce((v_patch->>'balance')::numeric, balance),
    coal = coalesce((v_patch->>'coal')::numeric, coal),
    oil = coalesce((v_patch->>'oil')::numeric, oil),
    copper = coalesce((v_patch->>'copper')::numeric, copper),
    iron = coalesce((v_patch->>'iron')::numeric, iron),
    uranium = coalesce((v_patch->>'uranium')::numeric, uranium),
    missile_1 = coalesce((v_patch->>'missile_1')::int, missile_1),
    missile_2 = coalesce((v_patch->>'missile_2')::int, missile_2),
    missile_3 = coalesce((v_patch->>'missile_3')::int, missile_3),
    soldier_packs = coalesce((v_patch->>'soldier_packs')::int, soldier_packs),
    tank_packs = coalesce((v_patch->>'tank_packs')::int, tank_packs)
  where id = p_country_id;

  perform public.sync_country_aa(p_country_id);

  select to_jsonb(c) into v_after
  from public.countries c
  where c.id = p_country_id;

  for k in select jsonb_object_keys(v_patch) loop
    if v_before ? k and (v_before->k) is distinct from (v_after->k) then
      v_old := v_old || jsonb_build_object(k, v_before->k);
      v_new := v_new || jsonb_build_object(k, v_after->k);
    end if;
  end loop;

  insert into public.admin_actions (actor_id, country_id, action, details)
  values (
    auth.uid(),
    p_country_id,
    'ADJUST_COUNTRY',
    jsonb_build_object('old', v_old, 'new', v_new, 'note', p_note)
  );

  insert into public.transactions (
    country_id, kind, label, amount_kr, actor_id, details
  )
  values (
    p_country_id,
    'ADMIN',
    'Korekta administracyjna',
    coalesce((v_new->>'balance')::numeric, 0) -
      coalesce((v_old->>'balance')::numeric, 0),
    auth.uid(),
    jsonb_build_object('old', v_old, 'new', v_new, 'note', p_note)
  );

  return jsonb_build_object(
    'ok', true,
    'old', v_old,
    'new', v_new
  );
end;
$function$;

grant execute on function public.admin_adjust_country(uuid, jsonb, text) to authenticated;

-- 3. Prevent two users from claiming MAIN_ADMIN at the same time.
-- Transaction-scoped advisory locking avoids changing existing role rows.
create or replace function public.claim_main_admin()
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
begin
  if auth.uid() is null then raise exception 'Brak autoryzacji'; end if;

  perform pg_advisory_xact_lock(
    hashtextextended('nation_dynamics:claim_main_admin', 0)
  );

  if exists (
    select 1 from public.user_roles where role = 'MAIN_ADMIN'
  ) then
    raise exception 'Główny administrator już istnieje';
  end if;

  delete from public.user_roles
  where user_id = auth.uid();

  insert into public.user_roles (user_id, role)
  values (auth.uid(), 'MAIN_ADMIN');

  return jsonb_build_object('ok', true);
end;
$function$;

grant execute on function public.claim_main_admin() to authenticated;


-- 4. Salvo targeting: keep the selected target list as a pool.
-- Intercepted missiles may reuse the same target pool; after a successful
-- impact, already-destroyed slots are automatically removed from the pool.
-- This prevents a harmless "target disappeared" error from ending a salvo
-- prematurely while preserving the existing missile/AA rules.
create or replace function public.launch_salvo(
  p_country_id uuid,
  p_missile_code text,
  p_region_id uuid,
  p_slot_ids uuid[] default '{}'::uuid[],
  p_mode text default 'factories',
  p_count integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  i int;
  v_res jsonb;
  v_results jsonb := '[]'::jsonb;
  v_intercepted int := 0;
  v_impacts int := 0;
  v_destroyed int := 0;
  v_err text;
  v_targets uuid[] := coalesce(p_slot_ids, '{}'::uuid[]);
  v_available uuid[];
begin
  if p_count is null or p_count < 1 or p_count > 100 then
    raise exception 'Nieprawidłowa liczba rakiet (1-100)';
  end if;

  for i in 1..p_count loop
    -- Keep only targets that still exist in the selected region.
    if p_missile_code <> 'missile_3' then
      select coalesce(array_agg(s.id), '{}'::uuid[])
      into v_available
      from public.region_slots s
      where s.region_id = p_region_id
        and s.id = any(v_targets);

      if coalesce(array_length(v_available, 1), 0) = 0 then
        if i = 1 then
          raise exception 'Wybierz cel w regionie';
        end if;
        exit;
      end if;
    else
      v_available := '{}';
    end if;

    begin
      v_res := public.launch_missile(
        p_country_id,
        p_missile_code,
        p_region_id,
        case when p_missile_code = 'missile_3' then '{}'::uuid[] else v_available end,
        p_mode
      );

      if v_res->>'result' = 'PRZECHWYCONA' then
        v_intercepted := v_intercepted + 1;
      else
        v_impacts := v_impacts + 1;
        v_destroyed := v_destroyed +
          coalesce(jsonb_array_length(v_res->'destroyed'), 0);
      end if;

      v_results := v_results || jsonb_build_object(
        'index', i,
        'result', v_res->>'result'
      );

    exception when others then
      v_err := sqlerrm;
      if i = 1 then
        raise exception '%', v_err;
      end if;
      exit;
    end;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'launched', v_intercepted + v_impacts,
    'intercepted', v_intercepted,
    'impacts', v_impacts,
    'destroyed', v_destroyed,
    'results', v_results,
    'stopped_reason', v_err
  );
end;
$function$;

grant execute on function public.launch_salvo(uuid, text, uuid, uuid[], text, integer)
to authenticated;
