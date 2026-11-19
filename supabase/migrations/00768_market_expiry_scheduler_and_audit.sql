-- 00768: schedule market expiry and distinguish automated audit events.
-- Production migrations are applied through Lovable Cloud.

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Keep the expiry routine callable by the scheduler/service role only.
REVOKE ALL ON FUNCTION public.market_expire_offers() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.market_expire_offers() TO service_role;

-- Mark changes made by the expiry routine so audit triggers do not attribute
-- automated clean-up to the player whose RPC happened to trigger it.
CREATE OR REPLACE FUNCTION public.market_expire_offers()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_count integer := 0;
  v_previous_actor text := current_setting('app.market_expiry_actor', true);
BEGIN
  PERFORM set_config('app.market_expiry_actor', 'system', true);

  FOR r IN
    SELECT *
    FROM public.market_offers
    WHERE status = 'ACTIVE'
      AND expires_at <= now()
    ORDER BY expires_at, id
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.countries
    SET
      coal = coal + CASE WHEN r.resource = 'coal' THEN r.quantity_remaining ELSE 0 END,
      oil = oil + CASE WHEN r.resource = 'oil' THEN r.quantity_remaining ELSE 0 END,
      copper = copper + CASE WHEN r.resource = 'copper' THEN r.quantity_remaining ELSE 0 END,
      iron = iron + CASE WHEN r.resource = 'iron' THEN r.quantity_remaining ELSE 0 END,
      uranium = uranium + CASE WHEN r.resource = 'uranium' THEN r.quantity_remaining ELSE 0 END,
      soldier_packs = soldier_packs + CASE WHEN r.resource = 'soldier_packs' THEN r.quantity_remaining ELSE 0 END,
      tank_packs = tank_packs + CASE WHEN r.resource = 'tank_packs' THEN r.quantity_remaining ELSE 0 END,
      missile_1 = missile_1 + CASE WHEN r.resource = 'missile_1' THEN r.quantity_remaining ELSE 0 END,
      missile_2 = missile_2 + CASE WHEN r.resource = 'missile_2' THEN r.quantity_remaining ELSE 0 END,
      missile_3 = missile_3 + CASE WHEN r.resource = 'missile_3' THEN r.quantity_remaining ELSE 0 END
    WHERE id = r.seller_country_id;

    UPDATE public.market_offers
    SET status = 'EXPIRED', quantity_remaining = 0
    WHERE id = r.id;

    UPDATE public.market_negotiations
    SET status = 'EXPIRED', updated_at = now()
    WHERE offer_id = r.id
      AND status = 'PENDING';

    v_count := v_count + 1;
  END LOOP;

  -- Negotiations can expire before their parent offer.
  UPDATE public.market_negotiations
  SET status = 'EXPIRED', updated_at = now()
  WHERE status = 'PENDING'
    AND expires_at <= now();

  PERFORM set_config('app.market_expiry_actor', coalesce(v_previous_actor, ''), true);
  RETURN v_count;
END;
$$;

-- Offer status audit: automated expiration has no player actor.
CREATE OR REPLACE FUNCTION public.market_audit_offer_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event text;
  v_system boolean := coalesce(current_setting('app.market_expiry_actor', true), '') = 'system';
BEGIN
  IF tg_op = 'INSERT' THEN
    INSERT INTO public.market_audit_events(
      offer_id, event_type, actor_country_id, resource, quantity, total_price, details
    )
    VALUES (
      new.id, 'OFFER_CREATED', new.seller_country_id, new.resource,
      new.quantity_total, new.total_price_remaining,
      jsonb_build_object('expires_at', new.expires_at, 'actor_type', 'PLAYER')
    );
    RETURN new;
  END IF;

  IF old.status IS DISTINCT FROM new.status THEN
    v_event := CASE new.status
      WHEN 'CANCELLED' THEN 'OFFER_CANCELLED'
      WHEN 'EXPIRED' THEN 'OFFER_EXPIRED'
      WHEN 'SOLD' THEN 'OFFER_COMPLETED'
      ELSE 'OFFER_STATUS_CHANGED'
    END;

    INSERT INTO public.market_audit_events(
      offer_id, event_type, actor_country_id, resource, quantity, total_price, details
    )
    VALUES (
      new.id, v_event,
      CASE WHEN v_system AND new.status = 'EXPIRED' THEN NULL ELSE new.seller_country_id END,
      new.resource, old.quantity_remaining, old.total_price_remaining,
      jsonb_build_object(
        'old_status', old.status,
        'new_status', new.status,
        'actor_type', CASE WHEN v_system AND new.status = 'EXPIRED' THEN 'SYSTEM' ELSE 'PLAYER' END
      )
    );
  ELSIF old.total_price_remaining IS DISTINCT FROM new.total_price_remaining
    AND old.quantity_remaining IS NOT DISTINCT FROM new.quantity_remaining THEN
    INSERT INTO public.market_audit_events(
      offer_id, event_type, actor_country_id, resource, quantity, total_price, details
    )
    VALUES (
      new.id, 'OFFER_PRICE_CHANGED', new.seller_country_id, new.resource,
      new.quantity_remaining, new.total_price_remaining,
      jsonb_build_object(
        'old_total', old.total_price_remaining,
        'new_total', new.total_price_remaining,
        'actor_type', 'PLAYER'
      )
    );
  END IF;

  RETURN new;
END;
$$;

-- Negotiation status audit: expiry is a system event, not an action by the
-- buyer or by the player whose request happened to run the clean-up.
CREATE OR REPLACE FUNCTION public.market_audit_negotiation_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offer public.market_offers;
  v_event text;
  v_actor uuid;
  v_other uuid;
  v_system boolean := coalesce(current_setting('app.market_expiry_actor', true), '') = 'system';
BEGIN
  SELECT * INTO v_offer
  FROM public.market_offers
  WHERE id = new.offer_id;

  IF tg_op = 'INSERT' THEN
    INSERT INTO public.market_audit_events(
      offer_id, negotiation_id, event_type, actor_country_id, counterparty_country_id,
      resource, quantity, total_price, details
    )
    VALUES (
      new.offer_id, new.id, 'NEGOTIATION_CREATED', new.buyer_country_id,
      v_offer.seller_country_id, v_offer.resource, new.quantity, new.total_price,
      jsonb_build_object('last_offer_by', new.last_offer_by, 'expires_at', new.expires_at, 'actor_type', 'PLAYER')
    );
    RETURN new;
  END IF;

  IF old.status IS DISTINCT FROM new.status THEN
    v_event := CASE new.status
      WHEN 'ACCEPTED' THEN 'NEGOTIATION_ACCEPTED'
      WHEN 'REJECTED' THEN 'NEGOTIATION_REJECTED'
      WHEN 'CANCELLED' THEN 'NEGOTIATION_CANCELLED'
      WHEN 'EXPIRED' THEN 'NEGOTIATION_EXPIRED'
      ELSE 'NEGOTIATION_STATUS_CHANGED'
    END;
  ELSIF old.quantity IS DISTINCT FROM new.quantity OR old.total_price IS DISTINCT FROM new.total_price THEN
    v_event := 'NEGOTIATION_COUNTEROFFER';
  ELSE
    RETURN new;
  END IF;

  IF v_system AND new.status = 'EXPIRED' THEN
    v_actor := NULL;
    v_other := NULL;
  ELSE
    v_actor := CASE
      WHEN public.my_country_id() IN (new.buyer_country_id, v_offer.seller_country_id)
        THEN public.my_country_id()
      ELSE new.buyer_country_id
    END;
    v_other := CASE
      WHEN v_actor = new.buyer_country_id THEN v_offer.seller_country_id
      ELSE new.buyer_country_id
    END;
  END IF;

  INSERT INTO public.market_audit_events(
    offer_id, negotiation_id, event_type, actor_country_id, counterparty_country_id,
    resource, quantity, total_price, details
  )
  VALUES (
    new.offer_id, new.id, v_event, v_actor, v_other,
    v_offer.resource, new.quantity, new.total_price,
    jsonb_build_object(
      'last_offer_by', new.last_offer_by,
      'status', new.status,
      'actor_type', CASE WHEN v_system AND new.status = 'EXPIRED' THEN 'SYSTEM' ELSE 'PLAYER' END
    )
  );

  RETURN new;
END;
$$;

-- System events have no player actor. Allow the two market participants to
-- read them through the related offer/negotiation instead.
DROP POLICY IF EXISTS market_audit_events_participants_read ON public.market_audit_events;
CREATE POLICY market_audit_events_participants_read ON public.market_audit_events
FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR actor_country_id = public.my_country_id()
  OR counterparty_country_id = public.my_country_id()
  OR EXISTS (
    SELECT 1
    FROM public.market_offers o
    WHERE o.id = market_audit_events.offer_id
      AND o.seller_country_id = public.my_country_id()
  )
  OR EXISTS (
    SELECT 1
    FROM public.market_negotiations n
    WHERE n.id = market_audit_events.negotiation_id
      AND n.buyer_country_id = public.my_country_id()
  )
);

REVOKE ALL ON FUNCTION public.market_audit_offer_event() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.market_audit_negotiation_event() FROM PUBLIC, anon, authenticated;

-- Avoid duplicate schedules if this migration is re-applied manually.
DO $$
DECLARE
  v_job_id bigint;
BEGIN
  FOR v_job_id IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'market-expire-offers-every-5-minutes'
  LOOP
    PERFORM cron.unschedule(v_job_id);
  END LOOP;

  PERFORM cron.schedule(
    'market-expire-offers-every-5-minutes',
    '*/5 * * * *',
    'SELECT public.market_expire_offers();'
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
