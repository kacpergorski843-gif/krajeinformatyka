-- 00749: make resource escrow visible in the country transaction history.
-- Sales already create ledger entries; offer creation and release did not.
create or replace function public.audit_market_escrow()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if tg_op = 'INSERT' then
    insert into public.transactions (
      country_id, kind, label, amount_kr, actor_id, details
    )
    values (
      new.seller_country_id,
      'MARKET_ESCROW',
      'Rezerwacja na rynku: ' || new.resource,
      0,
      auth.uid(),
      jsonb_build_object(
        'direction', 'out',
        'offer_id', new.id,
        'resource', new.resource,
        'amount', new.quantity_total
      )
    );
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.status = 'ACTIVE'
     and new.status in ('CANCELLED', 'EXPIRED')
     and old.quantity_remaining > 0 then
    insert into public.transactions (
      country_id, kind, label, amount_kr, actor_id, details
    )
    values (
      old.seller_country_id,
      'MARKET_ESCROW_RELEASE',
      'Zwrot rezerwacji rynkowej: ' || old.resource,
      0,
      case when new.status = 'CANCELLED' then auth.uid() else null end,
      jsonb_build_object(
        'direction', 'in',
        'offer_id', old.id,
        'resource', old.resource,
        'amount', old.quantity_remaining,
        'reason', new.status
      )
    );
  end if;

  return new;
end;
$function$;

drop trigger if exists market_offers_escrow_audit on public.market_offers;
create trigger market_offers_escrow_audit
after insert or update of status on public.market_offers
for each row execute function public.audit_market_escrow();

revoke all on function public.audit_market_escrow() from public, anon, authenticated;
grant execute on function public.audit_market_escrow() to service_role;

-- Backfill currently active offers once, without duplicating any existing
-- ledger row if this migration is ever replayed manually.
insert into public.transactions (
  country_id, kind, label, amount_kr, actor_id, details
)
select
  o.seller_country_id,
  'MARKET_ESCROW',
  'Rezerwacja na rynku: ' || o.resource,
  0,
  null,
  jsonb_build_object(
    'direction', 'out',
    'offer_id', o.id,
    'resource', o.resource,
    'amount', o.quantity_remaining,
    'backfilled', true
  )
from public.market_offers o
where o.status = 'ACTIVE'
  and o.quantity_remaining > 0
  and not exists (
    select 1
    from public.transactions t
    where t.kind = 'MARKET_ESCROW'
      and t.details->>'offer_id' = o.id::text
  );

notify pgrst, 'reload schema';
