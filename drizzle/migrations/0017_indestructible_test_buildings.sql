ALTER TABLE public.countries ADD COLUMN IF NOT EXISTS indestructible_buildings boolean NOT NULL DEFAULT false;
UPDATE public.countries SET indestructible_buildings = true WHERE id IN ('6601044c-cf99-4b1b-84d1-e23554472069','43839837-ffd8-4415-8e6e-c428cc717204');
CREATE OR REPLACE FUNCTION public.launch_missile(p_country_id uuid, p_missile_code text, p_region_id uuid, p_slot_ids uuid[] DEFAULT '{}'::uuid[], p_mode text DEFAULT 'factories'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_region public.regions; v_def public.countries; v_att public.countries;
  v_needed int; v_required_aa int; v_have int; v_intercepted boolean;
  v_targets uuid[]; v_destroyed jsonb := '[]'::jsonb; v_result text; v_label text;
begin
  if p_missile_code not in ('missile_1','missile_2','missile_3') then
    raise exception 'Nieprawidłowy typ rakiety';
  end if;
  perform public.assert_can_manage(p_country_id);

  select * into v_region from public.regions where id = p_region_id for update;
  if v_region.id is null then raise exception 'Nie znaleziono regionu'; end if;
  if v_region.country_id = p_country_id then raise exception 'Nie możesz atakować własnego państwa'; end if;

  select * into v_att from public.countries where id = p_country_id for update;
  select * into v_def from public.countries where id = v_region.country_id for update;

  v_have := case p_missile_code
    when 'missile_1' then v_att.missile_1
    when 'missile_2' then v_att.missile_2
    else v_att.missile_3 end;
  if v_have < 1 then raise exception 'Nie masz tej rakiety w arsenale'; end if;

  v_required_aa := case p_missile_code when 'missile_1' then 1 when 'missile_2' then 2 else 10 end;
  v_needed := case p_missile_code when 'missile_1' then 1 when 'missile_2' then 2 else 0 end;

  if p_missile_code = 'missile_3' then
    if p_mode not in ('factories','mines') then raise exception 'Wybierz fabryki albo zakłady surowcowe'; end if;
    select coalesce(array_agg(s.id), '{}') into v_targets
    from public.region_slots s
    where s.region_id = p_region_id
      and ((p_mode = 'factories' and s.building::text like 'factory_%')
        or (p_mode = 'mines' and s.building::text like 'mine_%'));
  else
    select coalesce(array_agg(s.id), '{}') into v_targets
    from public.region_slots s
    where s.region_id = p_region_id and s.id = any(p_slot_ids);
    if array_length(v_targets, 1) is null then raise exception 'Wybierz cel w regionie'; end if;
    if array_length(v_targets, 1) > v_needed then
      raise exception 'Ta rakieta niszczy maksymalnie % obiekt(y)', v_needed;
    end if;
  end if;

  update public.countries set
    missile_1 = missile_1 - case when p_missile_code = 'missile_1' then 1 else 0 end,
    missile_2 = missile_2 - case when p_missile_code = 'missile_2' then 1 else 0 end,
    missile_3 = missile_3 - case when p_missile_code = 'missile_3' then 1 else 0 end
  where id = p_country_id;

  v_intercepted := v_region.aa_defense >= v_required_aa;

  if v_intercepted then
    v_result := 'PRZECHWYCONA';
    update public.regions set aa_defense = aa_defense - v_required_aa where id = p_region_id;
    update public.countries set aa_defense = greatest(aa_defense - v_required_aa, 0) where id = v_region.country_id;
  else
    v_result := 'CEL ZNISZCZONY';
    select coalesce(jsonb_agg(jsonb_build_object('slot_id', s.id, 'slot_index', s.slot_index, 'building', s.building)), '[]'::jsonb)
      into v_destroyed
    from public.region_slots s where s.id = any(v_targets);
    if not coalesce(v_def.indestructible_buildings, false) then
      delete from public.region_slots where id = any(v_targets);
    end if;
  end if;

  insert into public.missile_strikes (attacker_country_id, defender_country_id, region_id, region_name,
    missile_code, result, aa_defense, destroyed, actor_id, region_aa, required_aa)
  values (p_country_id, v_region.country_id, p_region_id, v_region.name, p_missile_code, v_result,
    v_region.aa_defense, v_destroyed, auth.uid(), v_region.aa_defense, v_required_aa);

  v_label := 'Atak rakietowy na ' || v_def.name || ' (' || v_region.name || '): ' || v_result;
  insert into public.transactions (country_id, kind, label, amount_kr, actor_id, details)
  values (p_country_id, 'STRIKE', v_label, 0, auth.uid(),
    jsonb_build_object('missile', p_missile_code, 'region', v_region.name, 'result', v_result,
      'destroyed', v_destroyed, 'required_aa', v_required_aa, 'region_aa', v_region.aa_defense));

  insert into public.transactions (country_id, kind, label, amount_kr, actor_id, details)
  values (v_region.country_id, 'DEFENSE',
    'Atak rakietowy z ' || v_att.name || ' na region ' || v_region.name || ': ' || v_result,
    0, auth.uid(),
    jsonb_build_object('missile', p_missile_code, 'attacker', v_att.name, 'result', v_result,
      'destroyed', v_destroyed, 'required_aa', v_required_aa, 'region_aa', v_region.aa_defense));

  return jsonb_build_object('ok', true, 'result', v_result, 'destroyed', v_destroyed,
    'required_aa', v_required_aa, 'region_aa', v_region.aa_defense);
end;
$function$;