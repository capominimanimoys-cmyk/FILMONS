-- Emergency Listing: a fixed-price paid boost (72-hour $4.99 or 7-day
-- $9.99), distinct from the variable-budget listing_boosts system --
-- Emergency has flat tiers, not an audience/daily-budget slider, so it
-- gets its own table rather than being forced into listing_boosts' shape.
-- Follows the exact same split that system already established: a
-- transactional history table (one row per purchase/renewal attempt,
-- draft -> pending_payment -> active) plus denormalized "current status"
-- columns on listings itself for cheap feed-eligibility queries, updated
-- only by the webhook once Stripe actually confirms payment -- same
-- "webhook confirms truth" rule as listings.boosted/boosted_at.

ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS is_emergency boolean NOT NULL DEFAULT false;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS emergency_plan text CHECK (emergency_plan IN ('72_hour','7_day'));
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS emergency_amount numeric;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS emergency_activated_at timestamptz;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS emergency_expires_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_listings_emergency_active ON public.listings (is_emergency, emergency_expires_at) WHERE is_emergency = true;

CREATE TABLE IF NOT EXISTS public.listing_emergencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- listings.id is text (app-generated, not uuid) -- no FK, same pattern
  -- listing_boosts.listing_id already uses.
  listing_id text NOT NULL,
  owner_id uuid NOT NULL,
  plan text NOT NULL CHECK (plan IN ('72_hour','7_day')),
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'CAD',
  status text NOT NULL DEFAULT 'pending_payment'
    CHECK (status IN ('pending_payment','active','expired','failed','refunded')),
  activated_at timestamptz,
  expires_at timestamptz,
  emergency_payment_status text NOT NULL DEFAULT 'pending' CHECK (emergency_payment_status IN ('pending','paid','failed','refunded')),
  emergency_payment_id text, -- Stripe checkout session id, same role as listing_boosts.stripe_session_id
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS listing_emergencies_listing_id_idx ON public.listing_emergencies (listing_id);
CREATE INDEX IF NOT EXISTS listing_emergencies_status_idx ON public.listing_emergencies (status);

ALTER TABLE public.listing_emergencies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS listing_emergencies_all ON public.listing_emergencies;
CREATE POLICY listing_emergencies_all ON public.listing_emergencies FOR ALL USING (true) WITH CHECK (true);

-- Widen boost_events.source to also cover Emergency-listing impressions --
-- reused rather than duplicated into a new tracking table, since the
-- "how often has this viewer seen this listing recently" query
-- (boostApi.getRecentlySeenBoosted) is exactly the mechanism the spacing
-- rule for recycled Emergency listings needs too. boost_id stays NULL for
-- these rows, same as it already is for plain 'organic' events -- no
-- listing_boosts row exists to reference.
ALTER TABLE public.boost_events DROP CONSTRAINT IF EXISTS boost_events_source_check;
ALTER TABLE public.boost_events ADD CONSTRAINT boost_events_source_check
  CHECK (source IN ('organic','boosted','emergency'));

-- Same wallet_transactions.transaction_type widening listing_boosts did for
-- 'boost_purchase' -- pure platform revenue, no host-earning leg.
ALTER TABLE public.wallet_transactions
  DROP CONSTRAINT IF EXISTS wallet_transactions_transaction_type_check;
ALTER TABLE public.wallet_transactions
  ADD CONSTRAINT wallet_transactions_transaction_type_check
  CHECK (transaction_type IN ('rental_earning','service_earning','sale_earning','filmons_fee','refund','payout','adjustment','reversal','boost_purchase','emergency_purchase'));

-- Pure platform revenue, mirrors fn_finalize_boost_payment exactly.
-- p_amount/p_plan are passed in from the webhook, which itself only ever
-- reads them from what emergency-charge wrote server-side at Checkout
-- Session creation -- never from anything Stripe echoes back that could
-- have been tampered with client-side.
CREATE OR REPLACE FUNCTION public.fn_finalize_emergency_payment(
  p_idempotency_key text,
  p_emergency_id uuid,
  p_amount numeric,
  p_currency text DEFAULT 'CAD'
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_wallet_id uuid;
  v_listing_id text;
  v_plan text;
  v_duration interval;
  v_expires_at timestamptz;
BEGIN
  INSERT INTO payment_idempotency_keys(key) VALUES (p_idempotency_key) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT listing_id, plan INTO v_listing_id, v_plan FROM listing_emergencies WHERE id = p_emergency_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  v_duration := CASE WHEN v_plan = '7_day' THEN interval '7 days' ELSE interval '72 hours' END;
  v_expires_at := now() + v_duration;

  SELECT id INTO v_wallet_id FROM wallets WHERE owner_type = 'platform' AND currency = p_currency;
  IF NOT FOUND THEN
    INSERT INTO wallets(owner_type, owner_id, currency) VALUES ('platform', NULL, p_currency)
      RETURNING id INTO v_wallet_id;
  END IF;

  INSERT INTO wallet_transactions(wallet_id, order_id, transaction_type, amount, currency, balance_type, status, completed_at)
    VALUES (v_wallet_id, p_emergency_id::text, 'emergency_purchase', p_amount, p_currency, 'available', 'collected', now());
  UPDATE wallets SET available_balance = available_balance + p_amount, updated_at = now() WHERE id = v_wallet_id;

  UPDATE listing_emergencies
    SET status = 'active', emergency_payment_status = 'paid', activated_at = now(), expires_at = v_expires_at, updated_at = now()
    WHERE id = p_emergency_id;

  -- Renewal ("Boost Again") reuses this same function for a listing that
  -- already has is_emergency = true from a prior, now-expired period --
  -- this simply overwrites the denormalized columns with the fresh period,
  -- exactly like a first-time activation.
  UPDATE listings
    SET is_emergency = true, emergency_plan = v_plan, emergency_amount = p_amount,
        emergency_activated_at = now(), emergency_expires_at = v_expires_at
    WHERE id = v_listing_id;

  RETURN true;
END;
$$;
