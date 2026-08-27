-- Automated $0-fee Canadian bank payouts via Stripe Connect Custom
-- accounts, collected entirely in-app (no Stripe-hosted redirect). Adds a
-- second, automated fulfillment path alongside the existing manual
-- admin-approval pipeline (fn_request_payout/admin-process-payout, left
-- completely untouched) rather than replacing it outright, since a
-- grandfathered manual (Interac/bank_transfer) payout method still has no
-- way to be sent programmatically.

-- Zero the platform fee globally -- confirmed with the user this applies
-- to legacy manual cash-outs too, not just the new automated path.
UPDATE public.payout_config SET withdrawal_fee_rate = 0, instant_fee_rate = 0 WHERE id = 1;
ALTER TABLE public.payout_config ALTER COLUMN withdrawal_fee_rate SET DEFAULT 0;
ALTER TABLE public.payout_config ALTER COLUMN instant_fee_rate SET DEFAULT 0;

-- payout_methods: Custom-account identity/bank-display fields.
ALTER TABLE public.payout_methods ADD COLUMN IF NOT EXISTS account_type text;
  -- 'chequing' | 'savings' -- display-only, Stripe's CA bank_account object
  -- has no such field, so this is never sent to Stripe.
ALTER TABLE public.payout_methods ADD COLUMN IF NOT EXISTS account_holder_type text; -- 'individual' | 'company'
ALTER TABLE public.payout_methods ADD COLUMN IF NOT EXISTS requirements_due text[];
  -- Raw Stripe requirement keys still outstanding, for support/debugging
  -- only -- the UI shows a generic "needs attention" message, never these
  -- raw keys.

ALTER TABLE public.payout_methods DROP CONSTRAINT IF EXISTS payout_methods_status_check;
ALTER TABLE public.payout_methods ADD CONSTRAINT payout_methods_status_check
  CHECK (status IN ('pending', 'ready', 'incomplete', 'action_required'));

-- profiles: remember the chosen entity type so "Change bank account" never
-- has to re-ask it (only bank details are re-collected on a change).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS payout_account_type text; -- 'individual' | 'company'

-- payout_requests: automated-fulfillment tracking columns.
ALTER TABLE public.payout_requests ADD COLUMN IF NOT EXISTS stripe_transfer_id text;
ALTER TABLE public.payout_requests ADD COLUMN IF NOT EXISTS stripe_payout_id text;
ALTER TABLE public.payout_requests ADD COLUMN IF NOT EXISTS arrival_date timestamptz;
  -- From Stripe's Payout.arrival_date when the API returns one -- the "1-6
  -- business days" range is shown regardless; this is only used to also
  -- surface an exact date when the provider actually gives one.

-- Widen status to add 'sent' (money dispatched, not yet confirmed arrived)
-- -- every existing value is kept so historical manual-pipeline rows stay
-- valid; the new automated path only ever produces
-- requested -> processing -> sent -> paid, or failed/cancelled.
ALTER TABLE public.payout_requests DROP CONSTRAINT IF EXISTS payout_requests_status_check;
ALTER TABLE public.payout_requests ADD CONSTRAINT payout_requests_status_check
  CHECK (status IN ('requested','under_review','approved','processing','sent','paid','rejected','cancelled','failed'));

-- Automated-path wallet reservation -- mirrors fn_request_payout's
-- FOR UPDATE debit exactly, but fee is always zero (no platform-wallet
-- crediting branch needed at all) and payout_method/destination are fixed
-- to 'bank' since this path only ever exists for Stripe Custom accounts.
CREATE OR REPLACE FUNCTION public.fn_request_payout_automated(
  p_host_id uuid, p_amount numeric, p_currency text DEFAULT 'CAD'
) RETURNS uuid AS $$
DECLARE
  v_wallet_id uuid; v_available numeric; v_payout_id uuid;
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

  INSERT INTO public.payout_requests
    (wallet_id, host_id, amount, currency, status, payout_method, payout_speed, fee_amount, net_amount)
  VALUES (v_wallet_id, p_host_id, p_amount, p_currency, 'processing', 'bank', 'standard', 0, p_amount)
  RETURNING id INTO v_payout_id;

  RETURN v_payout_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Shared reversal used by both a synchronous Stripe-call failure in
-- request-payout and the async payout.failed webhook -- previously this
-- logic was duplicated between fn_cancel_payout_request and
-- admin-process-payout's reverseReservation; this is the one place the
-- automated path needs it. Caller sets the final status afterward (this
-- function only ever returns the funds and logs the reversal).
CREATE OR REPLACE FUNCTION public.fn_reverse_payout_request(
  p_payout_request_id uuid
) RETURNS boolean AS $$
DECLARE
  v_row record;
BEGIN
  SELECT * INTO v_row FROM public.payout_requests WHERE id = p_payout_request_id FOR UPDATE;
  IF v_row IS NULL THEN RETURN false; END IF;

  UPDATE public.wallets SET available_balance = available_balance + v_row.amount WHERE id = v_row.wallet_id;

  INSERT INTO public.wallet_transactions
    (wallet_id, transaction_type, amount, currency, balance_type, status, description)
  VALUES (v_row.wallet_id, 'reversal', v_row.amount, v_row.currency, 'available', 'reversed', 'Payout could not be completed — funds returned');

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
