-- Updates fn_finalize_payment's p_available_at DEFAULT to match the app's
-- actual hold period, now a flat 5 business days for every account tier
-- (see stripe-webhook/index.ts and finalize-cash-payment/index.ts, which
-- already compute and pass this explicitly on every real call today --
-- this default was previously 48 flat calendar hours and, being a
-- DEFAULT, is only ever used if some future caller omits the parameter).
-- Business-day math mirrors supabase/functions/_shared/businessDays.ts's
-- addBusinessDays() -- Saturday/Sunday don't count, no statutory-holiday
-- calendar.

CREATE OR REPLACE FUNCTION public.fn_add_business_days(p_start timestamptz, p_days integer)
RETURNS timestamptz AS $$
DECLARE
  v_result timestamptz := p_start;
  v_remaining integer := p_days;
BEGIN
  WHILE v_remaining > 0 LOOP
    v_result := v_result + interval '1 day';
    -- EXTRACT(DOW ...): 0 = Sunday, 6 = Saturday
    IF EXTRACT(DOW FROM v_result) NOT IN (0, 6) THEN
      v_remaining := v_remaining - 1;
    END IF;
  END LOOP;
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.fn_finalize_payment(
  p_idempotency_key   text,
  p_order_id          text,
  p_host_id           uuid,
  p_subtotal          numeric,
  p_seller_fee_amount numeric,
  p_buyer_fee_amount  numeric,
  p_currency          text DEFAULT 'CAD',
  p_available_at      timestamptz DEFAULT public.fn_add_business_days(now(), 5),
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
