-- Companion to fund-opportunity/fund-hire now allowing a retry from
-- payment_pending (previously a dead end -- an abandoned/expired Stripe
-- Checkout session left the owner/requester with no way back in, since
-- the app.status flip to 'payment_pending' happens on the FIRST POST,
-- before the redirect, not on actual payment confirmation).
--
-- Retrying creates a fresh Checkout Session each time rather than
-- reusing the old one. The existing idempotency (payment_idempotency_keys,
-- keyed by Stripe's event.id) only protects against the SAME event being
-- redelivered -- it does NOT protect against two DIFFERENT sessions for
-- the same transaction both somehow ending up paid (e.g. an old
-- abandoned checkout tab still open, completed after a retry already
-- succeeded). Each would carry a different event.id and both would pass
-- the existing idempotency check, double-crediting the wallet.
--
-- Adds a second, transaction-level guard: bail if the transaction is
-- already 'funded' before doing any wallet writes, regardless of the
-- idempotency key.
CREATE OR REPLACE FUNCTION public.fn_finalize_opportunity_payment(
  p_idempotency_key text, p_transaction_id uuid, p_order_id text,
  p_worker_id uuid, p_owner_id uuid,
  p_gross_amount numeric, p_fee_amount numeric, p_net_amount numeric,
  p_currency text, p_hold_review_days integer,
  p_stripe_session_id text, p_stripe_payment_intent_id text
) RETURNS boolean AS $$
DECLARE
  v_worker_wallet_id uuid; v_platform_wallet_id uuid;
  v_half numeric := round(p_net_amount / 2, 2);
  v_held numeric := p_net_amount - v_half;
  v_hold_release_at timestamptz := now() + make_interval(days => p_hold_review_days);
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

  INSERT INTO public.wallet_transactions (wallet_id, order_id, transaction_type, amount, currency, balance_type, status, payment_reference, description, completed_at)
  VALUES (v_worker_wallet_id, p_order_id, 'opportunity_earning', v_half, p_currency, 'available', 'available', p_idempotency_key, 'Opportunity earning (initial release)', now());

  INSERT INTO public.wallet_transactions (wallet_id, order_id, transaction_type, amount, currency, balance_type, status, payment_reference, description, available_at)
  VALUES (v_worker_wallet_id, p_order_id, 'opportunity_earning', v_held, p_currency, 'pending', 'pending', p_idempotency_key, 'Opportunity earning (held until completion)', v_hold_release_at);

  INSERT INTO public.wallet_transactions (wallet_id, order_id, transaction_type, amount, currency, balance_type, status, payment_reference, description, completed_at)
  VALUES (v_platform_wallet_id, p_order_id, 'filmons_fee', p_fee_amount, p_currency, 'available', 'collected', p_idempotency_key, 'Opportunity marketplace fee', now());

  UPDATE public.wallets SET available_balance = available_balance + v_half, pending_balance = pending_balance + v_held WHERE id = v_worker_wallet_id;
  UPDATE public.wallets SET available_balance = available_balance + p_fee_amount WHERE id = v_platform_wallet_id;

  UPDATE public.opportunity_transactions SET
    payment_status = 'funded', initial_release_amount = v_half, held_amount = v_held,
    initial_released_at = now(), hold_release_at = v_hold_release_at, funded_at = now(),
    stripe_checkout_session_id = p_stripe_session_id, stripe_payment_intent_id = p_stripe_payment_intent_id
  WHERE id = p_transaction_id;

  UPDATE public.opportunity_applications SET status = 'hired' WHERE id = (SELECT application_id FROM public.opportunity_transactions WHERE id = p_transaction_id);

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.fn_finalize_hire_payment(
  p_idempotency_key text, p_transaction_id uuid, p_order_id text,
  p_host_id uuid, p_requester_id uuid,
  p_gross_amount numeric, p_fee_amount numeric, p_net_amount numeric,
  p_currency text, p_hold_review_days integer,
  p_stripe_session_id text, p_stripe_payment_intent_id text
) RETURNS boolean AS $$
DECLARE
  v_host_wallet_id uuid; v_platform_wallet_id uuid;
  v_half numeric := round(p_net_amount / 2, 2);
  v_held numeric := p_net_amount - v_half;
  v_hold_release_at timestamptz := now() + make_interval(days => p_hold_review_days);
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

  INSERT INTO public.wallet_transactions (wallet_id, order_id, transaction_type, amount, currency, balance_type, status, payment_reference, description, completed_at)
  VALUES (v_host_wallet_id, p_order_id, 'hire_earning', v_half, p_currency, 'available', 'available', p_idempotency_key, 'Hire earning (initial release)', now());

  INSERT INTO public.wallet_transactions (wallet_id, order_id, transaction_type, amount, currency, balance_type, status, payment_reference, description, available_at)
  VALUES (v_host_wallet_id, p_order_id, 'hire_earning', v_held, p_currency, 'pending', 'pending', p_idempotency_key, 'Hire earning (held until completion)', v_hold_release_at);

  INSERT INTO public.wallet_transactions (wallet_id, order_id, transaction_type, amount, currency, balance_type, status, payment_reference, description, completed_at)
  VALUES (v_platform_wallet_id, p_order_id, 'filmons_fee', p_fee_amount, p_currency, 'available', 'collected', p_idempotency_key, 'Hire marketplace fee', now());

  UPDATE public.wallets SET available_balance = available_balance + v_half, pending_balance = pending_balance + v_held WHERE id = v_host_wallet_id;
  UPDATE public.wallets SET available_balance = available_balance + p_fee_amount WHERE id = v_platform_wallet_id;

  UPDATE public.hire_transactions SET
    payment_status = 'funded', initial_release_amount = v_half, held_amount = v_held,
    initial_released_at = now(), hold_release_at = v_hold_release_at, funded_at = now(),
    stripe_checkout_session_id = p_stripe_session_id, stripe_payment_intent_id = p_stripe_payment_intent_id,
    updated_at = now()
  WHERE id = p_transaction_id;

  UPDATE public.hire_requests SET status = 'hired', updated_at = now()
  WHERE id = (SELECT hire_request_id FROM public.hire_transactions WHERE id = p_transaction_id);

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
