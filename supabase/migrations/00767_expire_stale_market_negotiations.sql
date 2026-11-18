-- 00767: release the per-buyer offer slot when a negotiation expires.
-- Expired negotiations were hidden by the client but remained PENDING in the
-- database, so market_negotiations_one_pending_idx blocked a fresh proposal.

CREATE OR REPLACE FUNCTION public.market_expire_offers()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_count integer := 0;
BEGIN
  FOR r IN
    SELECT *
    FROM public.market_offers
    WHERE status = 'ACTIVE'
      AND expires_at <= now()
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

  -- A negotiation can expire before its offer. Expire those rows too, so the
  -- partial unique index no longer blocks the same buyer from proposing again.
  UPDATE public.market_negotiations
  SET status = 'EXPIRED', updated_at = now()
  WHERE status = 'PENDING'
    AND expires_at <= now();

  RETURN v_count;
END;
$$;

-- Run expiry before inserting a proposal. The function also expires offers
-- and refunds their remaining stock using the existing transactional logic.
CREATE OR REPLACE FUNCTION public.market_propose_total(
  p_offer_id uuid,
  p_quantity numeric,
  p_total_price numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offer public.market_offers;
  v_buyer uuid := public.my_country_id();
  v_id uuid;
BEGIN
  IF v_buyer IS NULL OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Brak przypisanego państwa';
  END IF;

  IF p_quantity IS NULL
    OR p_quantity < 1
    OR scale(p_quantity) > 0
    OR p_total_price IS NULL
    OR p_total_price < p_quantity
    OR scale(p_total_price) > 0
  THEN
    RAISE EXCEPTION 'Nieprawidłowa ilość lub łączna kwota';
  END IF;

  PERFORM public.market_expire_offers();

  SELECT *
  INTO v_offer
  FROM public.market_offers
  WHERE id = p_offer_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_offer.status <> 'ACTIVE'
    OR v_offer.expires_at <= now()
  THEN
    RAISE EXCEPTION 'Oferta jest niedostępna';
  END IF;

  IF v_offer.seller_country_id = v_buyer THEN
    RAISE EXCEPTION 'Nie możesz negocjować własnej oferty';
  END IF;

  IF p_quantity > v_offer.quantity_remaining THEN
    RAISE EXCEPTION 'Oferta nie ma takiej ilości';
  END IF;

  INSERT INTO public.market_negotiations (
    offer_id,
    buyer_country_id,
    quantity,
    unit_price,
    total_price,
    last_offer_by,
    expires_at
  )
  VALUES (
    p_offer_id,
    v_buyer,
    p_quantity,
    greatest(1, ceil(p_total_price / p_quantity)),
    p_total_price,
    'BUYER',
    least(now() + interval '7 days', v_offer.expires_at)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

NOTIFY pgrst, 'reload schema';
