-- Makes Stripe the source of truth for when a host's pending earnings
-- actually become available, instead of Filmons computing its own
-- estimate. Previously fn_finalize_payment / fn_finalize_opportunity_payment
-- / fn_finalize_hire_payment set wallet_transactions.available_at purely
-- from a local hold-period calculation (addBusinessDays/48h for rentals,
-- a hold_review_days completion-review window for opportunity/hire) --
-- correct as a dispute/completion-review gate, but blind to whether the
-- underlying Stripe charge had actually settled into Filmons' own Stripe
-- balance yet. A charge Stripe still shows as "Incoming, available on
-- Sep 2" could show as available in Filmons today if the review window
-- alone had already passed, or the payment simply succeeded quickly.
--
-- Fix: every wallet_transactions/orders row funded by a Stripe charge now
-- also stores stripe_payment_intent_id/stripe_charge_id/
-- stripe_balance_transaction_id/stripe_available_on (the balance
-- transaction's real available_on, Stripe's own settlement date) and
-- payout_availability_status ('pending'|'available', mirroring the
-- balance transaction's own status). The row's effective available_at
-- becomes GREATEST(<existing hold-period logic>, stripe_available_on) --
-- Stripe can only push the date later, never earlier, and
-- fn_release_pending_earnings additionally refuses to release a row still
-- flagged payout_availability_status = 'pending' even once its date has
-- passed -- only a re-check against live Stripe data (see the
-- sync-stripe-balance-availability Edge Function) ever clears that flag.

ALTER TABLE public.wallet_transactions
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id     text,
  ADD COLUMN IF NOT EXISTS stripe_charge_id              text,
  ADD COLUMN IF NOT EXISTS stripe_balance_transaction_id text,
  ADD COLUMN IF NOT EXISTS stripe_available_on           timestamptz,
  ADD COLUMN IF NOT EXISTS payout_availability_status    text CHECK (payout_availability_status IN ('pending','available'));

-- Rows the reconciliation pass needs to look at: still pending, and either
-- never linked to Stripe yet (payment_intent_id null, needs the backfill
-- lookup below) or linked but not yet confirmed available.
CREATE INDEX IF NOT EXISTS idx_wallet_tx_needs_stripe_sync
  ON public.wallet_transactions (balance_type, payout_availability_status)
  WHERE balance_type = 'pending' AND status = 'pending';

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS stripe_charge_id              text,
  ADD COLUMN IF NOT EXISTS stripe_balance_transaction_id text,
  ADD COLUMN IF NOT EXISTS stripe_available_on           timestamptz,
  ADD COLUMN IF NOT EXISTS payout_availability_status    text CHECK (payout_availability_status IN ('pending','available'));

-- Backfill: link every already-pending earning row to the Stripe payment
-- intent its order already recorded (orders.stripe_payment_intent_id has
-- been written by the webhook since before this migration existed) --
-- this is what lets sync-stripe-balance-availability find and correct
-- existing transactions whose local availability date doesn't match
-- Stripe's, without needing to touch already-released ('available')
-- history.
UPDATE public.wallet_transactions wt
SET stripe_payment_intent_id = o.stripe_payment_intent_id
FROM public.orders o
WHERE wt.order_id = o.id
  AND wt.stripe_payment_intent_id IS NULL
  AND o.stripe_payment_intent_id IS NOT NULL
  AND wt.balance_type = 'pending' AND wt.status = 'pending';

-- fn_finalize_payment: adds four optional Stripe params -- any caller that
-- omits them (none currently do, but keeps this backward compatible)
-- behaves exactly as before. p_available_at is still the existing hold-
-- period date; the real, stored available_at is whichever is LATER of
-- that and Stripe's own available_on.
CREATE OR REPLACE FUNCTION public.fn_finalize_payment(
  p_idempotency_key   text,
  p_order_id          text,
  p_host_id           uuid,
  p_subtotal          numeric,
  p_seller_fee_amount numeric,
  p_buyer_fee_amount  numeric,
  p_currency          text DEFAULT 'CAD',
  p_available_at      timestamptz DEFAULT (now() + interval '48 hours'),
  p_stripe_payment_intent_id      text DEFAULT NULL,
  p_stripe_charge_id              text DEFAULT NULL,
  p_stripe_balance_transaction_id text DEFAULT NULL,
  p_stripe_available_on           timestamptz DEFAULT NULL
) RETURNS boolean AS $$
DECLARE
  v_host_wallet_id     uuid;
  v_platform_wallet_id uuid;
  v_host_net           numeric := p_subtotal - p_seller_fee_amount;
  v_platform_fee_total numeric := p_buyer_fee_amount + p_seller_fee_amount;
  v_available_at       timestamptz := GREATEST(p_available_at, COALESCE(p_stripe_available_on, p_available_at));
  v_payout_status      text := CASE
    WHEN p_stripe_balance_transaction_id IS NULL THEN NULL
    WHEN p_stripe_available_on IS NOT NULL AND p_stripe_available_on <= now() THEN 'available'
    ELSE 'pending'
  END;
BEGIN
  -- Idempotency: PK violation means this key was already processed.
  BEGIN
    INSERT INTO public.payment_idempotency_keys (key) VALUES (p_idempotency_key);
  EXCEPTION WHEN unique_violation THEN
    RETURN false;
  END;

  INSERT INTO public.wallets (owner_type, owner_id, currency)
  VALUES ('host', p_host_id, p_currency)
  ON CONFLICT (owner_type, COALESCE(owner_id::text, ''), currency) DO UPDATE SET owner_type = EXCLUDED.owner_type
  RETURNING id INTO v_host_wallet_id;

  INSERT INTO public.wallets (owner_type, owner_id, currency)
  VALUES ('platform', NULL, p_currency)
  ON CONFLICT (owner_type, COALESCE(owner_id::text, ''), currency) DO UPDATE SET owner_type = EXCLUDED.owner_type
  RETURNING id INTO v_platform_wallet_id;

  INSERT INTO public.wallet_transactions
    (wallet_id, order_id, transaction_type, amount, currency, balance_type, status, payment_reference, description, available_at,
     stripe_payment_intent_id, stripe_charge_id, stripe_balance_transaction_id, stripe_available_on, payout_availability_status)
  VALUES
    (v_host_wallet_id, p_order_id, 'rental_earning', v_host_net, p_currency, 'pending', 'pending', p_idempotency_key, 'Rental earning', v_available_at,
     p_stripe_payment_intent_id, p_stripe_charge_id, p_stripe_balance_transaction_id, p_stripe_available_on, v_payout_status);

  INSERT INTO public.wallet_transactions
    (wallet_id, order_id, transaction_type, amount, currency, balance_type, status, payment_reference, description, completed_at)
  VALUES
    (v_platform_wallet_id, p_order_id, 'filmons_fee', v_platform_fee_total, p_currency, 'available', 'collected', p_idempotency_key, 'Filmons Fee', now());

  UPDATE public.wallets SET pending_balance = pending_balance + v_host_net WHERE id = v_host_wallet_id;
  UPDATE public.wallets SET available_balance = available_balance + v_platform_fee_total WHERE id = v_platform_wallet_id;

  IF p_stripe_balance_transaction_id IS NOT NULL THEN
    UPDATE public.orders SET
      stripe_charge_id = p_stripe_charge_id,
      stripe_balance_transaction_id = p_stripe_balance_transaction_id,
      stripe_available_on = p_stripe_available_on,
      payout_availability_status = v_payout_status
    WHERE id = p_order_id;
  END IF;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Same treatment for the Opportunity and Hire finalize functions -- both
-- hold the full net amount pending until completion is confirmed
-- (v_hold_release_at, unchanged business logic from 20240313), now also
-- floored against Stripe's own settlement date.
CREATE OR REPLACE FUNCTION public.fn_finalize_opportunity_payment(
  p_idempotency_key text, p_transaction_id uuid, p_order_id text,
  p_worker_id uuid, p_owner_id uuid,
  p_gross_amount numeric, p_fee_amount numeric, p_net_amount numeric,
  p_currency text, p_hold_review_days integer,
  p_stripe_session_id text, p_stripe_payment_intent_id text,
  p_stripe_charge_id text DEFAULT NULL,
  p_stripe_balance_transaction_id text DEFAULT NULL,
  p_stripe_available_on timestamptz DEFAULT NULL
) RETURNS boolean AS $$
DECLARE
  v_worker_wallet_id uuid; v_platform_wallet_id uuid;
  v_hold_release_at timestamptz := now() + make_interval(days => p_hold_review_days);
  v_available_at timestamptz := GREATEST(now() + make_interval(days => p_hold_review_days), COALESCE(p_stripe_available_on, now() + make_interval(days => p_hold_review_days)));
  v_payout_status text := CASE
    WHEN p_stripe_balance_transaction_id IS NULL THEN NULL
    WHEN p_stripe_available_on IS NOT NULL AND p_stripe_available_on <= now() THEN 'available'
    ELSE 'pending'
  END;
  v_already_funded boolean;
BEGIN
  SELECT (payment_status = 'funded') INTO v_already_funded FROM public.opportunity_transactions WHERE id = p_transaction_id;
  IF v_already_funded THEN RETURN false; END IF;

  BEGIN
    INSERT INTO public.payment_idempotency_keys (key) VALUES (p_idempotency_key);
  EXCEPTION WHEN unique_violation THEN RETURN false; END;

  INSERT INTO public.wallets (owner_type, owner_id, currency) VALUES ('host', p_worker_id, p_currency)
    ON CONFLICT (owner_type, COALESCE(owner_id::text, ''), currency) DO UPDATE SET owner_type = EXCLUDED.owner_type
    RETURNING id INTO v_worker_wallet_id;
  INSERT INTO public.wallets (owner_type, owner_id, currency) VALUES ('platform', NULL, p_currency)
    ON CONFLICT (owner_type, COALESCE(owner_id::text, ''), currency) DO UPDATE SET owner_type = EXCLUDED.owner_type
    RETURNING id INTO v_platform_wallet_id;

  INSERT INTO public.wallet_transactions
    (wallet_id, order_id, transaction_type, amount, currency, balance_type, status, payment_reference, description, available_at,
     stripe_payment_intent_id, stripe_charge_id, stripe_balance_transaction_id, stripe_available_on, payout_availability_status)
  VALUES
    (v_worker_wallet_id, p_order_id, 'opportunity_earning', p_net_amount, p_currency, 'pending', 'pending', p_idempotency_key, 'Opportunity earning (held until completion)', v_available_at,
     p_stripe_payment_intent_id, p_stripe_charge_id, p_stripe_balance_transaction_id, p_stripe_available_on, v_payout_status);

  INSERT INTO public.wallet_transactions (wallet_id, order_id, transaction_type, amount, currency, balance_type, status, payment_reference, description, completed_at)
  VALUES (v_platform_wallet_id, p_order_id, 'filmons_fee', p_fee_amount, p_currency, 'available', 'collected', p_idempotency_key, 'Opportunity marketplace fee', now());

  UPDATE public.wallets SET pending_balance = pending_balance + p_net_amount WHERE id = v_worker_wallet_id;
  UPDATE public.wallets SET available_balance = available_balance + p_fee_amount WHERE id = v_platform_wallet_id;

  UPDATE public.opportunity_transactions SET
    payment_status = 'funded', initial_release_amount = 0, held_amount = p_net_amount,
    initial_released_at = now(), hold_release_at = v_hold_release_at, funded_at = now(),
    stripe_checkout_session_id = p_stripe_session_id, stripe_payment_intent_id = p_stripe_payment_intent_id
  WHERE id = p_transaction_id;

  UPDATE public.opportunity_applications SET status = 'hired' WHERE id = (SELECT application_id FROM public.opportunity_transactions WHERE id = p_transaction_id);

  IF p_stripe_balance_transaction_id IS NOT NULL THEN
    UPDATE public.orders SET
      stripe_charge_id = p_stripe_charge_id,
      stripe_balance_transaction_id = p_stripe_balance_transaction_id,
      stripe_available_on = p_stripe_available_on,
      payout_availability_status = v_payout_status
    WHERE id = p_order_id;
  END IF;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.fn_finalize_hire_payment(
  p_idempotency_key text, p_transaction_id uuid, p_order_id text,
  p_host_id uuid, p_requester_id uuid,
  p_gross_amount numeric, p_fee_amount numeric, p_net_amount numeric,
  p_currency text, p_hold_review_days integer,
  p_stripe_session_id text, p_stripe_payment_intent_id text,
  p_stripe_charge_id text DEFAULT NULL,
  p_stripe_balance_transaction_id text DEFAULT NULL,
  p_stripe_available_on timestamptz DEFAULT NULL
) RETURNS boolean AS $$
DECLARE
  v_host_wallet_id uuid; v_platform_wallet_id uuid;
  v_hold_release_at timestamptz := now() + make_interval(days => p_hold_review_days);
  v_available_at timestamptz := GREATEST(now() + make_interval(days => p_hold_review_days), COALESCE(p_stripe_available_on, now() + make_interval(days => p_hold_review_days)));
  v_payout_status text := CASE
    WHEN p_stripe_balance_transaction_id IS NULL THEN NULL
    WHEN p_stripe_available_on IS NOT NULL AND p_stripe_available_on <= now() THEN 'available'
    ELSE 'pending'
  END;
  v_already_funded boolean;
BEGIN
  SELECT (payment_status = 'funded') INTO v_already_funded FROM public.hire_transactions WHERE id = p_transaction_id;
  IF v_already_funded THEN RETURN false; END IF;

  BEGIN
    INSERT INTO public.payment_idempotency_keys (key) VALUES (p_idempotency_key);
  EXCEPTION WHEN unique_violation THEN RETURN false; END;

  INSERT INTO public.wallets (owner_type, owner_id, currency) VALUES ('host', p_host_id, p_currency)
    ON CONFLICT (owner_type, COALESCE(owner_id::text, ''), currency) DO UPDATE SET owner_type = EXCLUDED.owner_type
    RETURNING id INTO v_host_wallet_id;
  INSERT INTO public.wallets (owner_type, owner_id, currency) VALUES ('platform', NULL, p_currency)
    ON CONFLICT (owner_type, COALESCE(owner_id::text, ''), currency) DO UPDATE SET owner_type = EXCLUDED.owner_type
    RETURNING id INTO v_platform_wallet_id;

  INSERT INTO public.wallet_transactions
    (wallet_id, order_id, transaction_type, amount, currency, balance_type, status, payment_reference, description, available_at,
     stripe_payment_intent_id, stripe_charge_id, stripe_balance_transaction_id, stripe_available_on, payout_availability_status)
  VALUES
    (v_host_wallet_id, p_order_id, 'hire_earning', p_net_amount, p_currency, 'pending', 'pending', p_idempotency_key, 'Hire earning (held until completion)', v_available_at,
     p_stripe_payment_intent_id, p_stripe_charge_id, p_stripe_balance_transaction_id, p_stripe_available_on, v_payout_status);

  INSERT INTO public.wallet_transactions (wallet_id, order_id, transaction_type, amount, currency, balance_type, status, payment_reference, description, completed_at)
  VALUES (v_platform_wallet_id, p_order_id, 'filmons_fee', p_fee_amount, p_currency, 'available', 'collected', p_idempotency_key, 'Hire marketplace fee', now());

  UPDATE public.wallets SET pending_balance = pending_balance + p_net_amount WHERE id = v_host_wallet_id;
  UPDATE public.wallets SET available_balance = available_balance + p_fee_amount WHERE id = v_platform_wallet_id;

  UPDATE public.hire_transactions SET
    payment_status = 'funded', initial_release_amount = 0, held_amount = p_net_amount,
    initial_released_at = now(), hold_release_at = v_hold_release_at, funded_at = now(),
    stripe_checkout_session_id = p_stripe_session_id, stripe_payment_intent_id = p_stripe_payment_intent_id,
    updated_at = now()
  WHERE id = p_transaction_id;

  UPDATE public.hire_requests SET status = 'hired', updated_at = now()
  WHERE id = (SELECT hire_request_id FROM public.hire_transactions WHERE id = p_transaction_id);

  IF p_stripe_balance_transaction_id IS NOT NULL THEN
    UPDATE public.orders SET
      stripe_charge_id = p_stripe_charge_id,
      stripe_balance_transaction_id = p_stripe_balance_transaction_id,
      stripe_available_on = p_stripe_available_on,
      payout_availability_status = v_payout_status
    WHERE id = p_order_id;
  END IF;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Refuses to release a row still explicitly flagged Stripe-pending, even
-- once its available_at date has passed -- only a live Stripe re-check
-- (fn_sync_stripe_balance_transaction, called from
-- sync-stripe-balance-availability) can clear payout_availability_status
-- to 'available'. Rows with no Stripe link at all (payout_availability_
-- status IS NULL -- pre-existing non-Stripe paths, if any) release on
-- date exactly as before.
CREATE OR REPLACE FUNCTION public.fn_release_pending_earnings()
RETURNS integer AS $$
DECLARE
  v_row record;
  v_count integer := 0;
BEGIN
  FOR v_row IN
    SELECT wt.* FROM public.wallet_transactions wt
    WHERE wt.balance_type = 'pending' AND wt.status = 'pending' AND wt.available_at IS NOT NULL AND wt.available_at <= now()
      AND wt.payout_availability_status IS DISTINCT FROM 'pending'
      AND NOT EXISTS (
        SELECT 1 FROM public.orders o WHERE o.id = wt.order_id AND o.dispute_status = 'disputed'
      )
  LOOP
    UPDATE public.wallet_transactions
      SET balance_type = 'available', status = 'available', completed_at = now()
      WHERE id = v_row.id;

    UPDATE public.wallets
      SET pending_balance = pending_balance - v_row.amount,
          available_balance = available_balance + v_row.amount
      WHERE id = v_row.wallet_id;

    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Called by sync-stripe-balance-availability after re-checking a specific
-- balance transaction against live Stripe data. Only ever moves
-- available_at later (GREATEST), never earlier -- this corrects "shown
-- available too early", it must never make an already-correct later date
-- earlier due to a stale/racing Stripe read.
CREATE OR REPLACE FUNCTION public.fn_sync_stripe_balance_transaction(
  p_wallet_transaction_id uuid,
  p_stripe_charge_id text,
  p_stripe_balance_transaction_id text,
  p_stripe_available_on timestamptz,
  p_payout_availability_status text
) RETURNS void AS $$
BEGIN
  UPDATE public.wallet_transactions SET
    stripe_charge_id = COALESCE(p_stripe_charge_id, stripe_charge_id),
    stripe_balance_transaction_id = COALESCE(p_stripe_balance_transaction_id, stripe_balance_transaction_id),
    stripe_available_on = p_stripe_available_on,
    payout_availability_status = p_payout_availability_status,
    available_at = GREATEST(COALESCE(available_at, p_stripe_available_on), p_stripe_available_on)
  WHERE id = p_wallet_transaction_id;

  UPDATE public.orders o SET
    stripe_charge_id = COALESCE(p_stripe_charge_id, o.stripe_charge_id),
    stripe_balance_transaction_id = COALESCE(p_stripe_balance_transaction_id, o.stripe_balance_transaction_id),
    stripe_available_on = p_stripe_available_on,
    payout_availability_status = p_payout_availability_status
  FROM public.wallet_transactions wt
  WHERE wt.id = p_wallet_transaction_id AND o.id = wt.order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
