-- Speed up the administrator history views, which sort these append-only
-- event tables globally by newest timestamp and return only the latest rows.
CREATE INDEX IF NOT EXISTS transactions_created_at_idx
  ON public.transactions (created_at DESC);

CREATE INDEX IF NOT EXISTS admin_actions_created_at_idx
  ON public.admin_actions (created_at DESC);

CREATE INDEX IF NOT EXISTS missile_strikes_created_at_idx
  ON public.missile_strikes (created_at DESC);
