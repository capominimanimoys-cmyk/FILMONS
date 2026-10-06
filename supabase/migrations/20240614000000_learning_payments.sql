-- FILMONS Learning payments -- a paid course or a paid live session is
-- charged through Stripe Checkout (learning-charge) and, once Stripe
-- confirms it (stripe-webhook), the instructor's net earnings are
-- deposited in their FILMONS Wallet (pending, then available after the
-- same hold as every other earning) and the platform fee goes to the
-- platform wallet. Only fn_finalize_learning_payment (service role) moves
-- the money; the client never writes balances.

-- Every transaction_type any flow uses today, plus the two new ones.
ALTER TABLE public.wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_transaction_type_check;
ALTER TABLE public.wallet_transactions ADD CONSTRAINT wallet_transactions_transaction_type_check
  CHECK (transaction_type IN ('rental_earning','service_earning','sale_earning','filmons_fee','refund','payout','adjustment','reversal',
                               'boost_purchase','instant_payout_fee','opportunity_earning','hire_earning','emergency_purchase',
                               'course_earning','live_session_earning'));

ALTER TABLE public.course_transactions
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id    text,
  ADD COLUMN IF NOT EXISTS paid_at                     timestamptz;
ALTER TABLE public.live_session_applications
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text,
  ADD COLUMN IF NOT EXISTS paid_at                    timestamptz;

CREATE OR REPLACE FUNCTION public.fn_finalize_learning_payment(
  p_idempotency_key text,
  p_kind            text,          -- 'course' | 'live_session'
  p_ref_id          uuid,          -- course_transactions.id | live_session_applications.id
  p_instructor_id   uuid,
  p_buyer_id        uuid,
  p_course_id       uuid,          -- course purchases only
  p_gross_amount    numeric,
  p_fee_amount      numeric,
  p_net_amount      numeric,
  p_currency        text,
  p_stripe_session_id text,
  p_stripe_payment_intent_id text,
  p_stripe_charge_id text DEFAULT NULL,
  p_stripe_balance_transaction_id text DEFAULT NULL,
  p_stripe_available_on timestamptz DEFAULT NULL
) RETURNS boolean AS $$
DECLARE
  v_wallet uuid; v_platform uuid;
  v_hold timestamptz := now() + interval '5 days';
  v_available_at timestamptz;
  v_payout_status text := CASE
    WHEN p_stripe_balance_transaction_id IS NULL THEN NULL
    WHEN p_stripe_available_on IS NOT NULL AND p_stripe_available_on <= now() THEN 'available'
    ELSE 'pending' END;
  v_type text := CASE WHEN p_kind = 'course' THEN 'course_earning' ELSE 'live_session_earning' END;
  v_order text := CASE WHEN p_kind = 'course' THEN 'COURSE-' ELSE 'LIVE-' END || p_ref_id::text;
  v_done boolean;
BEGIN
  IF p_kind NOT IN ('course','live_session') THEN RAISE EXCEPTION 'bad kind'; END IF;
  v_available_at := GREATEST(v_hold, COALESCE(p_stripe_available_on, v_hold));

  -- Already settled -> no-op (a retried Checkout can't double-credit).
  IF p_kind = 'course' THEN
    SELECT (status = 'paid') INTO v_done FROM public.course_transactions WHERE id = p_ref_id;
  ELSE
    SELECT (status = 'confirmed' AND paid_at IS NOT NULL) INTO v_done FROM public.live_session_applications WHERE id = p_ref_id;
  END IF;
  IF v_done THEN RETURN false; END IF;

  BEGIN
    INSERT INTO public.payment_idempotency_keys (key) VALUES (p_idempotency_key);
  EXCEPTION WHEN unique_violation THEN RETURN false; END;

  INSERT INTO public.wallets (owner_type, owner_id, currency) VALUES ('host', p_instructor_id, p_currency)
    ON CONFLICT (owner_type, COALESCE(owner_id::text, ''), currency) DO UPDATE SET owner_type = EXCLUDED.owner_type
    RETURNING id INTO v_wallet;
  INSERT INTO public.wallets (owner_type, owner_id, currency) VALUES ('platform', NULL, p_currency)
    ON CONFLICT (owner_type, COALESCE(owner_id::text, ''), currency) DO UPDATE SET owner_type = EXCLUDED.owner_type
    RETURNING id INTO v_platform;

  INSERT INTO public.wallet_transactions
    (wallet_id, order_id, transaction_type, amount, currency, balance_type, status, payment_reference, description, available_at,
     stripe_payment_intent_id, stripe_charge_id, stripe_balance_transaction_id, stripe_available_on, payout_availability_status)
  VALUES
    (v_wallet, v_order, v_type, p_net_amount, p_currency, 'pending', 'pending', p_idempotency_key,
     CASE WHEN p_kind = 'course' THEN 'Course sale' ELSE 'Live session booking' END, v_available_at,
     p_stripe_payment_intent_id, p_stripe_charge_id, p_stripe_balance_transaction_id, p_stripe_available_on, v_payout_status);

  INSERT INTO public.wallet_transactions
    (wallet_id, order_id, transaction_type, amount, currency, balance_type, status, payment_reference, description, completed_at)
  VALUES
    (v_platform, v_order, 'filmons_fee', p_fee_amount, p_currency, 'available', 'collected', p_idempotency_key, 'Learning fee', now());

  UPDATE public.wallets SET pending_balance = pending_balance + p_net_amount WHERE id = v_wallet;
  UPDATE public.wallets SET available_balance = available_balance + p_fee_amount WHERE id = v_platform;

  IF p_kind = 'course' THEN
    UPDATE public.course_transactions SET status = 'paid', paid_at = now(),
      stripe_checkout_session_id = p_stripe_session_id, stripe_payment_intent_id = p_stripe_payment_intent_id,
      payment_provider_ref = p_stripe_payment_intent_id
    WHERE id = p_ref_id;
    INSERT INTO public.course_enrollments (user_id, course_id, payment_id, status)
    VALUES (p_buyer_id, p_course_id, p_ref_id, 'active')
    ON CONFLICT (user_id, course_id) DO UPDATE SET status = 'active', payment_id = EXCLUDED.payment_id;
  ELSE
    UPDATE public.live_session_applications SET status = 'confirmed', paid_at = now(),
      stripe_checkout_session_id = p_stripe_session_id, updated_at = now()
    WHERE id = p_ref_id;
  END IF;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
