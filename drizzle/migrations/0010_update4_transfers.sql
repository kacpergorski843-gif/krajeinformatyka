-- UPDATE 4.0: secure country-to-country transfers for existing liquid resources.
create or replace function public.transfer_resource(
  p_from_country_id uuid,
  p_to_country_id uuid,
  p_resource text,
  p_amount numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_from public.countries;
  v_to public.countries;
  v_from_name text;
  v_to_name text;
  v_lock_first uuid;
  v_lock_second uuid;
  v_from_balance numeric;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Podaj dodatnią ilość';
  end if;
  if p_from_country_id = p_to_country_id then
    raise exception 'Nie możesz wysłać zasobu do własnego państwa';
  end if;
  if p_resource not in ('balance','coal','oil','copper','iron','uranium') then
    raise exception 'Ten zasób nie może być obecnie przesyłany';
  end if;

  perform public.assert_can_manage(p_from_country_id);

  v_lock_first := least(p_from_country_id, p_to_country_id);
  v_lock_second := greatest(p_from_country_id, p_to_country_id);
  perform 1 from public.countries where id = v_lock_first for update;
  perform 1 from public.countries where id = v_lock_second for update;

  select * into v_from from public.countries where id = p_from_country_id;
  select * into v_to from public.countries where id = p_to_country_id;

  if v_from.id is null or v_to.id is null then
    raise exception 'Nie znaleziono państwa';
  end if;

  v_from_balance := case p_resource
    when 'balance' then v_from.balance
    when 'coal' then v_from.coal
    when 'oil' then v_from.oil
    when 'copper' then v_from.copper
    when 'iron' then v_from.iron
    else v_from.uranium
  end;

  if v_from_balance < p_amount then
    raise exception 'Brak wystarczającej ilości zasobu';
  end if;

  execute format(
    'update public.countries set %I = %I - $1 where id = $2',
    p_resource, p_resource
  ) using p_amount, p_from_country_id;
  execute format(
    'update public.countries set %I = %I + $1 where id = $2',
    p_resource, p_resource
  ) using p_amount, p_to_country_id;

  select name into v_from_name from public.countries where id = p_from_country_id;
  select name into v_to_name from public.countries where id = p_to_country_id;

  insert into public.transactions (country_id, kind, label, amount_kr, actor_id, details)
  values (
    p_from_country_id, 'TRANSFER',
    'Transfer: ' || p_resource || ' → ' || v_to_name,
    case when p_resource = 'balance' then -p_amount else 0 end,
    auth.uid(),
    jsonb_build_object('direction','out','resource',p_resource,'amount',p_amount,'to_country_id',p_to_country_id)
  );

  insert into public.transactions (country_id, kind, label, amount_kr, actor_id, details)
  values (
    p_to_country_id, 'TRANSFER',
    'Transfer: ' || p_resource || ' ← ' || v_from_name,
    case when p_resource = 'balance' then p_amount else 0 end,
    auth.uid(),
    jsonb_build_object('direction','in','resource',p_resource,'amount',p_amount,'from_country_id',p_from_country_id)
  );

  return jsonb_build_object('ok',true,'resource',p_resource,'amount',p_amount);
end;
$function$;

grant execute on function public.transfer_resource(uuid,uuid,text,numeric) to authenticated;
