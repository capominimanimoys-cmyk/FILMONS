-- Wallet flow: pending -> available (only when Stripe confirms) -> withdrawal processing -> paid / failed.
--
-- 1. Earnings leave Pending ONLY when Stripe has confirmed those funds are available for payout. A date alone
--    never releases a Stripe-funded earning (the hold/review date is still a second gate, never a substitute).
--    Earnings with no Stripe link at all (cash payments, legacy rows) keep releasing on their date.
--    Each release also tells the user: "Your earnings are ready -- $X is now available to withdraw".
-- 2. A failed withdrawal's money goes back to Available only once it has really come back (see
--    fn_return_failed_payout, called after Stripe confirms the transfer was reversed).
-- 3. Payout rows are linked to their ledger entry so "paid" / "failed" update the history.

ALTER TABLE public.payout_requests
  ADD COLUMN IF NOT EXISTS return_status   text CHECK (return_status IN ('pending', 'returned', 'needs_review')),
  ADD COLUMN IF NOT EXISTS failure_code    text,
  ADD COLUMN IF NOT EXISTS failure_message text;

ALTER TABLE public.wallet_transactions
  ADD COLUMN IF NOT EXISTS payout_request_id uuid;
CREATE INDEX IF NOT EXISTS idx_wallet_tx_payout_request ON public.wallet_transactions (payout_request_id) WHERE payout_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payout_requests_return_pending ON public.payout_requests (return_status) WHERE return_status = 'pending';

-- Reserve + record the withdrawal in one transaction (same checks as before), now linking the ledger entry.
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

  INSERT INTO public.payout_requests
    (wallet_id, host_id, amount, currency, status, payout_method, payout_speed, fee_amount, net_amount)
  VALUES (v_wallet_id, p_host_id, p_amount, p_currency, 'processing', 'bank', 'standard', 0, p_amount)
  RETURNING id INTO v_payout_id;

  INSERT INTO public.wallet_transactions
    (wallet_id, transaction_type, amount, currency, balance_type, status, description, payout_request_id)
  VALUES (v_wallet_id, 'payout', -p_amount, p_currency, 'available', 'processing', 'Withdrawal processing', v_payout_id);

  RETURN v_payout_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Gives a failed withdrawal's money back to Available. Idempotent: a webhook retry or the hourly retry pass can
-- call it any number of times, the money is only ever returned once.
CREATE OR REPLACE FUNCTION public.fn_return_failed_payout(p_payout_request_id uuid) RETURNS boolean AS $$
DECLARE
  v_row record;
BEGIN
  SELECT * INTO v_row FROM public.payout_requests WHERE id = p_payout_request_id FOR UPDATE;
  IF v_row IS NULL OR v_row.return_status = 'returned' THEN RETURN false; END IF;

  UPDATE public.wallets SET available_balance = available_balance + v_row.amount WHERE id = v_row.wallet_id;
  UPDATE public.wallet_transactions SET status = 'reversed'
    WHERE payout_request_id = v_row.id AND transaction_type = 'payout';
  INSERT INTO public.wallet_transactions
    (wallet_id, transaction_type, amount, currency, balance_type, status, description, payout_request_id)
  VALUES (v_row.wallet_id, 'reversal', v_row.amount, v_row.currency, 'available', 'reversed',
          'Withdrawal could not be completed — funds returned', v_row.id);
  UPDATE public.payout_requests SET return_status = 'returned' WHERE id = v_row.id;
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Stripe confirmed the payout as paid: close out the ledger entry.
CREATE OR REPLACE FUNCTION public.fn_mark_payout_paid(p_payout_request_id uuid) RETURNS void AS $$
BEGIN
  UPDATE public.wallet_transactions SET status = 'paid_out', completed_at = now()
    WHERE payout_request_id = p_payout_request_id AND transaction_type = 'payout';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Pending -> Available, only for earnings Stripe has confirmed as available for payout (or that never touched
-- Stripe), once their own hold/review date has passed and no dispute is open. Tells the user when it happens.
CREATE OR REPLACE FUNCTION public.fn_release_pending_earnings()
RETURNS integer AS $$
DECLARE
  v_row record;
  v_owner uuid;
  v_count integer := 0;
BEGIN
  FOR v_row IN
    SELECT wt.* FROM public.wallet_transactions wt
    WHERE wt.balance_type = 'pending' AND wt.status = 'pending' AND wt.available_at IS NOT NULL AND wt.available_at <= now()
      AND (
        wt.payout_availability_status = 'available'
        OR (wt.payout_availability_status IS NULL AND wt.stripe_payment_intent_id IS NULL AND wt.stripe_balance_transaction_id IS NULL)
      )
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

    SELECT owner_id INTO v_owner FROM public.wallets WHERE id = v_row.wallet_id AND owner_type = 'host';
    IF v_owner IS NOT NULL THEN
      BEGIN
        INSERT INTO public.notifications (user_id, actor_id, actor_name, type, title, is_read)
        VALUES (v_owner, NULL, 'Filmons', 'payment_released',
                'Your earnings are ready — $' || to_char(v_row.amount, 'FM999999990.00') || ' is now available to withdraw', false);
      EXCEPTION WHEN OTHERS THEN NULL;   -- a notification problem must never block moving the money
      END;
    END IF;

    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
