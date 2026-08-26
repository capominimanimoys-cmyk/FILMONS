-- Manual cash-out system: closes the gaps between the existing
-- wallet/payout_requests stack and the full spec'd flow, rather than
-- introducing a second, parallel `withdrawals` table.

-- New flat FILMONS withdrawal fee (8%) applied to every cash-out,
-- separate from the existing instant-speed-only upcharge below.
ALTER TABLE public.payout_config
  ADD COLUMN IF NOT EXISTS withdrawal_fee_rate numeric NOT NULL DEFAULT 0.08;

ALTER TABLE public.payout_requests
  ADD COLUMN IF NOT EXISTS platform_fee_rate   numeric,
  ADD COLUMN IF NOT EXISTS platform_fee_amount numeric,
  ADD COLUMN IF NOT EXISTS approved_at    timestamptz,
  ADD COLUMN IF NOT EXISTS processing_at  timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at   timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_at    timestamptz;

ALTER TABLE public.payout_requests DROP CONSTRAINT IF EXISTS payout_requests_status_check;
ALTER TABLE public.payout_requests ADD CONSTRAINT payout_requests_status_check
  CHECK (status IN ('requested','under_review','approved','processing','paid','rejected','cancelled','failed'));

-- Bug found during audit: this CHECK never widened past interac/bank_transfer
-- even though card/bank (Stripe-Connect-backed) methods are accepted
-- everywhere else in the app, so a host defaulting to a Stripe-backed method
-- could never actually request a payout.
ALTER TABLE public.payout_requests DROP CONSTRAINT IF EXISTS payout_requests_payout_method_check;
ALTER TABLE public.payout_requests ADD CONSTRAINT payout_requests_payout_method_check
  CHECK (payout_method IN ('interac','bank_transfer','card','bank'));

-- Replaces fn_request_payout (20240304000000_payout_speed.sql) to also
-- compute and store the new flat platform fee, stacking with the existing
-- instant-speed fee when applicable. Host wallet debit behavior is
-- unchanged (still reserves the full requested p_amount). Both fee amounts
-- are computed by the caller (request-payout, from the live payout_config
-- row) and passed in -- never trusted as raw client values.
CREATE OR REPLACE FUNCTION public.fn_request_payout(
  p_host_id uuid, p_amount numeric, p_currency text DEFAULT 'CAD',
  p_payout_method text DEFAULT NULL, p_payout_destination jsonb DEFAULT NULL,
  p_payout_speed text DEFAULT 'standard', p_fee_amount numeric DEFAULT 0,
  p_estimated_arrival_at timestamptz DEFAULT NULL,
  p_platform_fee_rate numeric DEFAULT 0, p_platform_fee_amount numeric DEFAULT 0
) RETURNS uuid AS $$
DECLARE
  v_wallet_id uuid; v_available numeric; v_payout_id uuid; v_platform_wallet_id uuid;
  v_total_fee numeric := p_fee_amount + p_platform_fee_amount;
  v_net numeric := p_amount - v_total_fee;
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

  IF v_total_fee > 0 THEN
    INSERT INTO public.wallets (owner_type, owner_id, currency)
    VALUES ('platform', NULL, p_currency)
    ON CONFLICT (owner_type, COALESCE(owner_id::text, ''), currency) DO UPDATE SET owner_type = EXCLUDED.owner_type
    RETURNING id INTO v_platform_wallet_id;

    IF p_fee_amount > 0 THEN
      INSERT INTO public.wallet_transactions
        (wallet_id, transaction_type, amount, currency, balance_type, status, description, completed_at)
      VALUES (v_platform_wallet_id, 'instant_payout_fee', p_fee_amount, p_currency, 'available', 'collected', 'Instant Payout fee', now());
    END IF;

    IF p_platform_fee_amount > 0 THEN
      INSERT INTO public.wallet_transactions
        (wallet_id, transaction_type, amount, currency, balance_type, status, description, completed_at)
      VALUES (v_platform_wallet_id, 'filmons_fee', p_platform_fee_amount, p_currency, 'available', 'collected', 'Cash-out fee', now());
    END IF;

    UPDATE public.wallets SET available_balance = available_balance + v_total_fee WHERE id = v_platform_wallet_id;
  END IF;

  INSERT INTO public.payout_requests
    (wallet_id, host_id, amount, currency, status, payout_method, payout_destination, payout_speed,
     fee_amount, net_amount, estimated_arrival_at, platform_fee_rate, platform_fee_amount)
  VALUES (v_wallet_id, p_host_id, p_amount, p_currency, 'requested', p_payout_method, p_payout_destination, p_payout_speed,
          p_fee_amount, v_net, p_estimated_arrival_at, p_platform_fee_rate, p_platform_fee_amount)
  RETURNING id INTO v_payout_id;

  RETURN v_payout_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- User-initiated cancel of their own still-open request. Mirrors the
-- reversal logic admin-process-payout's `reject` action already does.
CREATE OR REPLACE FUNCTION public.fn_cancel_payout_request(
  p_payout_request_id uuid, p_host_id uuid
) RETURNS boolean AS $$
DECLARE
  v_row record;
BEGIN
  SELECT * INTO v_row FROM public.payout_requests
  WHERE id = p_payout_request_id AND host_id = p_host_id
  FOR UPDATE;

  IF v_row IS NULL OR v_row.status NOT IN ('requested', 'under_review') THEN
    RETURN false;
  END IF;

  UPDATE public.wallets SET available_balance = available_balance + v_row.amount WHERE id = v_row.wallet_id;

  INSERT INTO public.wallet_transactions
    (wallet_id, transaction_type, amount, currency, balance_type, status, description)
  VALUES (v_row.wallet_id, 'reversal', v_row.amount, v_row.currency, 'available', 'reversed', 'Payout request cancelled');

  UPDATE public.payout_requests SET status = 'cancelled', updated_at = now() WHERE id = p_payout_request_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
