-- Backwards-compatible entry point for clients that still call market_buy.
-- The wrapper delegates to the total-price implementation, so it cannot
-- re-enable the retired per-unit pricing logic.
CREATE OR REPLACE FUNCTION public.market_buy(p_offer_id uuid, p_quantity numeric)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT public.market_buy_total(p_offer_id, p_quantity);
$$;

REVOKE ALL ON FUNCTION public.market_buy(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.market_buy(uuid, numeric) TO authenticated;

NOTIFY pgrst, 'reload schema';
