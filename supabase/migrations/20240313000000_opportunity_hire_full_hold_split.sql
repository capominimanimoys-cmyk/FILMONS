-- Changes the Opportunity/Hire escrow split from 50% immediate + 50%
-- held (the original design) to 100% held at funding, released to 100%
-- available only once the owner confirms completion -- an explicit,
-- confirmed product decision, not a bug fix. No historical transactions
-- are affected: nothing has ever actually reached 'funded' status yet
-- (confirmed against live data before this change), so there's no
-- existing 50/50-split payout to reconcile.
--
-- The release mechanism itself is UNCHANGED: confirm_completion (in
-- manage-application/manage-hire-request) still just flips the held
-- wallet_transactions row's available_at to now(), and the existing
-- hourly fn_release_pending_earnings cron still does the actual move to
-- available balance -- zero new code there. Only the SPLIT at funding
-- time changes: the full net amount is now the held row, and no
-- separate "initial release" row is created at all (avoids the
-- double-entry a fake $0 "immediate" row would add for no reason).
CREATE OR REPLACE FUNCTION public.fn_finalize_opportunity_payment(
  p_idempotency_key text, p_transaction_id uuid, p_order_id text,
  p_worker_id uuid, p_owner_id uuid,
  p_gross_amount numeric, p_fee_amount numeric, p_net_amount numeric,
  p_currency text, p_hold_review_days integer,
  p_stripe_session_id text, p_stripe_payment_intent_id text
) RETURNS boolean AS $$
DECLARE
  v_worker_wallet_id uuid; v_platform_wallet_id uuid;
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

  -- Full net amount held until completion — no immediate-available portion.
  INSERT INTO public.wallet_transactions (wallet_id, order_id, transaction_type, amount, currency, balance_type, status, payment_reference, description, available_at)
  VALUES (v_worker_wallet_id, p_order_id, 'opportunity_earning', p_net_amount, p_currency, 'pending', 'pending', p_idempotency_key, 'Opportunity earning (held until completion)', v_hold_release_at);

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

  INSERT INTO public.wallet_transactions (wallet_id, order_id, transaction_type, amount, currency, balance_type, status, payment_reference, description, available_at)
  VALUES (v_host_wallet_id, p_order_id, 'hire_earning', p_net_amount, p_currency, 'pending', 'pending', p_idempotency_key, 'Hire earning (held until completion)', v_hold_release_at);

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

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
