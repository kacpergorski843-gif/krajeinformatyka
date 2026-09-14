
create or replace view public.country_stats
with (security_invoker = true) as
select c.id as country_id, c.name, c.flag, c.balance, c.coal, c.oil, c.copper, c.iron, c.uranium,
  c.aa_defense, c.missile_1, c.missile_2, c.missile_3, c.soldier_packs, c.tank_packs,
  least(c.soldier_packs,6) + least(c.tank_packs,4) as war_votes,
  coalesce(b.regions_count,0) as regions_count,
  coalesce(b.gross_income,0::numeric)::numeric(30,0) as gross_income,
  coalesce(b.coal_upkeep,0)::numeric(30,0) as coal_upkeep,
  coalesce(b.coal_prod,0)::numeric(30,0) as coal_prod,
  coalesce(b.oil_prod,0)::numeric(30,0) as oil_prod,
  coalesce(b.copper_prod,0)::numeric(30,0) as copper_prod,
  coalesce(b.iron_prod,0)::numeric(30,0) as iron_prod,
  coalesce(b.uranium_prod,0)::numeric(30,0) as uranium_prod,
  coalesce(b.forts,0) as forts,
  (c.aa_defense::numeric * 1000000000
   + c.missile_1::numeric * 2000000000
   + c.missile_2::numeric * 5000000000
   + c.missile_3::numeric * 12000000000
   + c.soldier_packs::numeric * 20000000000
   + c.tank_packs::numeric * 30000000000
   + coalesce(b.forts,0)::numeric * 40000000000)::numeric(30,0) as military_value,
  coalesce(b.fort_votes,0)::int as fort_votes,
  (least(c.soldier_packs,6) + least(c.tank_packs,4) + coalesce(b.fort_votes,0))::int as total_votes
from public.countries c
left join (
  select r.country_id,
    count(distinct r.id) as regions_count,
    sum(case s.building when 'factory_1' then 20000000000 when 'factory_2' then 50000000000
      when 'factory_3' then 80000000000 when 'factory_4' then 150000000000
      when 'factory_5' then 250000000000 else 0 end) as gross_income,
    sum(case s.building when 'factory_4' then 50 when 'factory_5' then 100 else 0 end) as coal_upkeep,
    sum(case when s.building = 'mine_coal' then 100 else 0 end) as coal_prod,
    sum(case when s.building = 'mine_oil' then 100 else 0 end) as oil_prod,
    sum(case when s.building = 'mine_copper' then 100 else 0 end) as copper_prod,
    sum(case when s.building = 'mine_iron' then 100 else 0 end) as iron_prod,
    sum(case when s.building = 'mine_uranium' then 25 else 0 end) as uranium_prod,
    count(s.id) filter (where s.building in ('fort_1','fort_2','fort_3')) as forts,
    sum(case s.building when 'fort_1' then 1 when 'fort_2' then 2 when 'fort_3' then 3 else 0 end) as fort_votes
  from public.regions r
  left join public.region_slots s on s.region_id = r.id
  group by r.country_id
) b on b.country_id = c.id;

grant select on public.country_stats to authenticated;

create or replace function public.purchase_unit(p_country_id uuid, p_item_code text, p_qty integer default 1)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_item public.shop_items; c public.countries; v_votes int;
begin
  if p_qty is null or p_qty < 1 or p_qty > 100 then raise exception 'Nieprawidłowa ilość'; end if;
  perform public.assert_can_manage(p_country_id);
  select * into v_item from public.shop_items where code = p_item_code and active;
  if v_item.code is null then raise exception 'Nie znaleziono produktu'; end if;
  if v_item.building is not null then raise exception 'Ten obiekt buduje się w regionie'; end if;

  select * into c from public.countries where id = p_country_id;

  if p_item_code in ('soldiers','tanks') then
    v_votes := least(c.soldier_packs,6) + least(c.tank_packs,4);
    if v_votes >= 10 then
      raise exception 'Osiągnięto maksymalną liczbę 10 głosów wojennych z wojska';
    end if;
    if v_votes + p_qty > 10 then
      raise exception 'Łączny limit głosów wojennych to 10 (dostępne: %)', 10 - v_votes;
    end if;
  end if;

  if p_item_code = 'soldiers' and c.soldier_packs + p_qty > 6 then
    raise exception 'Maksymalnie 6 pakietów żołnierzy';
  end if;
  if p_item_code = 'tanks' and c.tank_packs + p_qty > 4 then
    raise exception 'Maksymalnie 4 pakiety czołgów';
  end if;

  perform public.charge_country(p_country_id, v_item, p_qty);

  update public.countries set
    aa_defense = aa_defense + case when p_item_code = 'aa' then p_qty else 0 end,
    missile_1 = missile_1 + case when p_item_code = 'missile_1' then p_qty else 0 end,
    missile_2 = missile_2 + case when p_item_code = 'missile_2' then p_qty else 0 end,
    missile_3 = missile_3 + case when p_item_code = 'missile_3' then p_qty else 0 end,
    soldier_packs = soldier_packs + case when p_item_code = 'soldiers' then p_qty else 0 end,
    tank_packs = tank_packs + case when p_item_code = 'tanks' then p_qty else 0 end
  where id = p_country_id;

  insert into public.transactions (country_id, kind, label, amount_kr, actor_id, details)
  values (p_country_id, 'PURCHASE', 'Zakup: ' || v_item.name || ' x' || p_qty,
          -(v_item.cost_kr * p_qty), auth.uid(), jsonb_build_object('item', v_item.code, 'qty', p_qty));
  return jsonb_build_object('ok', true);
end;
$function$;
