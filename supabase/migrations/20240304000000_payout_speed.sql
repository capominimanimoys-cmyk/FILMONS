-- Standard (free) vs Instant (2% fee, priority-processed) payout speed.
-- No real Stripe Connect exists in this app (every payout is still a human
-- admin manually sending an Interac/bank transfer outside Stripe) -- so
-- "Instant" means priority processing in the same manual queue, never a
-- real automated transfer. Fee comes out of what the host nets, never
-- added on top: request $500 instant -> host wallet still reserves the
-- full $500, host receives $490, Filmons collects the $10 fee separately.

ALTER TABLE public.payout_requests
  ADD COLUMN IF NOT EXISTS payout_speed text NOT NULL DEFAULT 'standard' CHECK (payout_speed IN ('standard','instant')),
  ADD COLUMN IF NOT EXISTS fee_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_amount numeric,
  ADD COLUMN IF NOT EXISTS estimated_arrival_at timestamptz;

-- Admin-configurable, not hardcoded, matching this app's established
-- convention (boost_config, entitlements) rather than scattering "2%"
-- through components.
CREATE TABLE IF NOT EXISTS public.payout_config (
  id int PRIMARY KEY DEFAULT 1,
  instant_fee_rate numeric NOT NULL DEFAULT 0.02,
  updated_at timestamptz DEFAULT now()
);
INSERT INTO public.payout_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.payout_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payout_config_select ON public.payout_config;
CREATE POLICY payout_config_select ON public.payout_config FOR SELECT USING (true);

ALTER TABLE public.wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_transaction_type_check;
ALTER TABLE public.wallet_transactions ADD CONSTRAINT wallet_transactions_transaction_type_check
  CHECK (transaction_type IN ('rental_earning','service_earning','sale_earning','filmons_fee','refund','payout','adjustment','reversal','boost_purchase','instant_payout_fee'));

-- Replaces fn_request_payout (20240218000000_refunds_disputes.sql:192-227).
-- Host wallet debit behavior is UNCHANGED (still reserves the full
-- requested p_amount). p_fee_amount is computed by the caller
-- (request-payout, from the live payout_config row), never trusted as a
-- raw client value.
CREATE OR REPLACE FUNCTION public.fn_request_payout(
  p_host_id uuid, p_amount numeric, p_currency text DEFAULT 'CAD',
  p_payout_method text DEFAULT NULL, p_payout_destination jsonb DEFAULT NULL,
  p_payout_speed text DEFAULT 'standard', p_fee_amount numeric DEFAULT 0,
  p_estimated_arrival_at timestamptz DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  v_wallet_id uuid; v_available numeric; v_payout_id uuid; v_platform_wallet_id uuid;
  v_net numeric := p_amount - p_fee_amount;
BEGIN
  SELECT id, available_balance INTO v_wallet_id, v_available
  FROM public.wallets WHERE owner_type = 'host' AND owner_id = p_host_id AND currency = p_currency
  FOR UPDATE;

  IF v_wallet_id IS NULL OR p_amount <= 0 OR v_available < p_amount THEN
    RAISE EXCEPTION 'Insufficient available balance';
  END IF;

  UPDATE public.wallets SET available_balance = available_balance - p_amount WHERE id = v_wallet_id;

  INSERT INTO public.wallet_transactions
    (wallet_id, transaction_type, amount, currency, balance_type, status, description)
  VALUES (v_wallet_id, 'payout', -p_amount, p_currency, 'available', 'processing', 'Payout requested');

  IF p_fee_amount > 0 THEN
    INSERT INTO public.wallets (owner_type, owner_id, currency)
    VALUES ('platform', NULL, p_currency)
    ON CONFLICT (owner_type, COALESCE(owner_id::text, ''), currency) DO UPDATE SET owner_type = EXCLUDED.owner_type
    RETURNING id INTO v_platform_wallet_id;

    INSERT INTO public.wallet_transactions
      (wallet_id, transaction_type, amount, currency, balance_type, status, description, completed_at)
    VALUES (v_platform_wallet_id, 'instant_payout_fee', p_fee_amount, p_currency, 'available', 'collected', 'Instant Payout fee', now());

    UPDATE public.wallets SET available_balance = available_balance + p_fee_amount WHERE id = v_platform_wallet_id;
  END IF;

  INSERT INTO public.payout_requests
    (wallet_id, host_id, amount, currency, status, payout_method, payout_destination, payout_speed, fee_amount, net_amount, estimated_arrival_at)
  VALUES (v_wallet_id, p_host_id, p_amount, p_currency, 'requested', p_payout_method, p_payout_destination, p_payout_speed, p_fee_amount, v_net, p_estimated_arrival_at)
  RETURNING id INTO v_payout_id;

  RETURN v_payout_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
