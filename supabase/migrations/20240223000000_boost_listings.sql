-- Instagram-Promote-style paid Boost Listing feature.
-- Replaces the earlier free instant-toggle boost (listings.boosted/boosted_at
-- from 20240222000000_listings_boost.sql are kept, but now only ever flipped
-- server-side once a paid boost actually goes active).

-- Admin-configurable slider bounds for the Budget & Duration step.
-- Admin edit UI is a later phase; this table exists now so the frontend
-- never hard-codes min/max values.
CREATE TABLE IF NOT EXISTS public.boost_config (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  min_daily_budget numeric NOT NULL DEFAULT 5,
  max_daily_budget numeric NOT NULL DEFAULT 100,
  min_duration_days int NOT NULL DEFAULT 1,
  max_duration_days int NOT NULL DEFAULT 30,
  currency text NOT NULL DEFAULT 'CAD',
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.boost_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.listing_boosts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.listings(id),
  owner_id uuid NOT NULL,
  goal text NOT NULL CHECK (goal IN ('more_views','more_messages','more_rental_requests','more_booking_requests')),
  audience_type text NOT NULL CHECK (audience_type IN ('automatic','local','custom')),
  audience_config jsonb NOT NULL DEFAULT '{}',
  daily_budget numeric NOT NULL,
  total_budget numeric NOT NULL,
  currency text NOT NULL DEFAULT 'CAD',
  duration_days int NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','pending_payment','active','paused','completed','stopped','failed','refunded')),
  starts_at timestamptz,
  ends_at timestamptz,
  amount_spent numeric NOT NULL DEFAULT 0,
  stripe_session_id text,
  payment_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS listing_boosts_listing_id_idx ON public.listing_boosts (listing_id);
CREATE INDEX IF NOT EXISTS listing_boosts_status_idx ON public.listing_boosts (status);

CREATE TABLE IF NOT EXISTS public.boost_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.listings(id),
  boost_id uuid REFERENCES public.listing_boosts(id),
  event_type text NOT NULL CHECK (event_type IN ('impression','view','save','message','rental_request')),
  source text NOT NULL CHECK (source IN ('organic','boosted')),
  viewer_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS boost_events_listing_type_source_idx ON public.boost_events (listing_id, event_type, source);
CREATE INDEX IF NOT EXISTS boost_events_boost_id_idx ON public.boost_events (boost_id);

ALTER TABLE public.wallet_transactions
  DROP CONSTRAINT IF EXISTS wallet_transactions_transaction_type_check;
ALTER TABLE public.wallet_transactions
  ADD CONSTRAINT wallet_transactions_transaction_type_check
  CHECK (transaction_type IN ('rental_earning','service_earning','sale_earning','filmons_fee','refund','payout','adjustment','reversal','boost_purchase'));

ALTER TABLE public.boost_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS boost_config_read ON public.boost_config;
CREATE POLICY boost_config_read ON public.boost_config FOR SELECT USING (true);

ALTER TABLE public.listing_boosts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS listing_boosts_all ON public.listing_boosts;
CREATE POLICY listing_boosts_all ON public.listing_boosts FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.boost_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS boost_events_all ON public.boost_events;
CREATE POLICY boost_events_all ON public.boost_events FOR ALL USING (true) WITH CHECK (true);

-- Pure platform revenue (no host-earning leg, unlike fn_finalize_payment).
CREATE OR REPLACE FUNCTION public.fn_finalize_boost_payment(
  p_idempotency_key text,
  p_boost_id uuid,
  p_amount numeric,
  p_currency text DEFAULT 'CAD'
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_wallet_id uuid;
  v_listing_id uuid;
BEGIN
  INSERT INTO payment_idempotency_keys(key) VALUES (p_idempotency_key) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT listing_id INTO v_listing_id FROM listing_boosts WHERE id = p_boost_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT id INTO v_wallet_id FROM wallets WHERE owner_type = 'platform' AND currency = p_currency;
  IF NOT FOUND THEN
    INSERT INTO wallets(owner_type, owner_id, currency) VALUES ('platform', NULL, p_currency)
      RETURNING id INTO v_wallet_id;
  END IF;

  INSERT INTO wallet_transactions(wallet_id, order_id, transaction_type, amount, currency, balance_type, status, completed_at)
    VALUES (v_wallet_id, p_boost_id::text, 'boost_purchase', p_amount, p_currency, 'available', 'collected', now());
  UPDATE wallets SET available_balance = available_balance + p_amount, updated_at = now() WHERE id = v_wallet_id;

  UPDATE listing_boosts
    SET status = 'active', starts_at = now(), ends_at = now() + (duration_days || ' days')::interval, updated_at = now()
    WHERE id = p_boost_id;
  UPDATE listings SET boosted = true, boosted_at = now() WHERE id = v_listing_id;

  RETURN true;
END;
$$;
