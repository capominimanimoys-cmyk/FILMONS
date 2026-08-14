-- Real refunds, dispute holds, and immediate fund reservation on withdrawal
-- request — reversing the earlier two deferrals (fee-engine task, wallet
-- ledger task) now that the product decision is to build them for real.
--
-- `orders` still has no tracked migration anywhere (same untracked/live
-- situation as before) — additive only, so nothing existing breaks.

ALTER TABLE IF EXISTS public.orders
  ADD COLUMN IF NOT EXISTS refund_status text NOT NULL DEFAULT 'none'
    CHECK (refund_status IN ('none','requested','processing','refunded','partially_refunded')),
  ADD COLUMN IF NOT EXISTS refund_amount numeric,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS dispute_status text NOT NULL DEFAULT 'none'
    CHECK (dispute_status IN ('none','disputed','resolved')),
  ADD COLUMN IF NOT EXISTS disputed_at timestamptz;

CREATE TABLE IF NOT EXISTS public.refund_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      text NOT NULL,
  requester_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason        text,
  amount        numeric NOT NULL,
  status        text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','denied','processed')),
  requested_at  timestamptz NOT NULL DEFAULT now(),
  processed_at  timestamptz,
  processed_by  text,
  stripe_refund_id text
);
CREATE INDEX IF NOT EXISTS idx_refund_requests_order ON public.refund_requests(order_id);
CREATE INDEX IF NOT EXISTS idx_refund_requests_status ON public.refund_requests(status);

ALTER TABLE public.refund_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "refund_requests_all" ON public.refund_requests;
CREATE POLICY "refund_requests_all" ON public.refund_requests FOR ALL USING (true) WITH CHECK (true);

-- wallet_transactions.status needs 'held' (dispute-frozen pending entries)
-- and 'processing' (a payout reserved at request time, before admin marks
-- it actually paid) — drop and recreate the CHECK constraint (Postgres has
-- no ADD-VALUE-TO-CHECK shortcut).
ALTER TABLE public.wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_status_check;
ALTER TABLE public.wallet_transactions
  ADD CONSTRAINT wallet_transactions_status_check
  CHECK (status IN ('pending','available','reversed','collected','paid_out','held','processing'));

-- ── Manual payout request flow ──────────────────────────────────────────
-- Filmons never auto-initiates a payout-provider transfer — "Request
-- Payout" only ever reserves the funds and creates a request for a human
-- admin to review and, once the money has actually been sent manually
-- (e-transfer, bank transfer), mark paid. Richer status lifecycle than the
-- original wallet-ledger migration's payout_requests (requested/
-- processing/paid/rejected) — widen the CHECK rather than starting a new
-- table, no data exists yet to migrate.
ALTER TABLE public.payout_requests DROP CONSTRAINT IF EXISTS payout_requests_status_check;
ALTER TABLE public.payout_requests
  ADD CONSTRAINT payout_requests_status_check
  CHECK (status IN ('requested','under_review','approved','processing','paid','rejected','cancelled'));

ALTER TABLE public.payout_requests
  ADD COLUMN IF NOT EXISTS payout_method text CHECK (payout_method IN ('interac','bank_transfer')),
  ADD COLUMN IF NOT EXISTS payout_destination jsonb, -- real value for admin to actually send money to; masked client-side, never rendered in full to the host after entry
  ADD COLUMN IF NOT EXISTS payment_reference text,   -- admin-entered proof-of-send reference, captured on Mark Paid
  ADD COLUMN IF NOT EXISTS admin_notes text,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

-- A host's saved payout method(s) — so they don't have to re-enter
-- destination details on every request. Real values stored (an admin has
-- to actually use them to send money manually — there's no payment
-- processor here to tokenize them), masked only at render time client-side,
-- same trust model as the rest of this app (see project_auth_model).
CREATE TABLE IF NOT EXISTS public.payout_methods (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  method     text NOT NULL CHECK (method IN ('interac','bank_transfer')),
  details    jsonb NOT NULL,
  is_default boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payout_methods_host ON public.payout_methods(host_id);

ALTER TABLE public.payout_methods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payout_methods_all" ON public.payout_methods;
CREATE POLICY "payout_methods_all" ON public.payout_methods FOR ALL USING (true) WITH CHECK (true);

-- Every admin action on a payout request gets an immutable audit row —
-- mirrors the rental_agreement_audit_log pattern already used elsewhere.
CREATE TABLE IF NOT EXISTS public.payout_audit_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_request_id uuid NOT NULL REFERENCES public.payout_requests(id) ON DELETE CASCADE,
  admin_name        text,
  action            text NOT NULL CHECK (action IN ('approved','rejected','marked_processing','marked_paid')),
  reason            text,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payout_audit_request ON public.payout_audit_log(payout_request_id);

ALTER TABLE public.payout_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payout_audit_log_all" ON public.payout_audit_log;
CREATE POLICY "payout_audit_log_all" ON public.payout_audit_log FOR ALL USING (true) WITH CHECK (true);

-- Reverses a payment: creates negative ledger entries against whichever
-- balance the original earning currently sits in (still pending, or
-- already released to available — available is allowed to go negative,
-- an accepted real-world edge case rather than silently blocking the
-- refund), and mirrors the platform fee back out too. Original entries are
-- never deleted or modified — full accounting history stays intact.
CREATE OR REPLACE FUNCTION public.fn_process_refund(
  p_order_id text,
  p_amount   numeric,
  p_reason   text DEFAULT NULL
) RETURNS boolean AS $$
DECLARE
  v_host_tx    record;
  v_platform_tx record;
BEGIN
  SELECT wt.* INTO v_host_tx
  FROM public.wallet_transactions wt
  WHERE wt.order_id = p_order_id AND wt.transaction_type = 'rental_earning'
  ORDER BY wt.created_at ASC LIMIT 1;

  SELECT wt.* INTO v_platform_tx
  FROM public.wallet_transactions wt
  WHERE wt.order_id = p_order_id AND wt.transaction_type = 'filmons_fee'
  ORDER BY wt.created_at ASC LIMIT 1;

  IF v_host_tx.id IS NOT NULL THEN
    INSERT INTO public.wallet_transactions
      (wallet_id, order_id, transaction_type, amount, currency, balance_type, status, description, completed_at)
    VALUES
      (v_host_tx.wallet_id, p_order_id, 'refund', -p_amount, v_host_tx.currency, v_host_tx.balance_type,
       'reversed', COALESCE(p_reason, 'Refund'), now());

    IF v_host_tx.balance_type = 'pending' THEN
      UPDATE public.wallets SET pending_balance = pending_balance - p_amount WHERE id = v_host_tx.wallet_id;
    ELSE
      UPDATE public.wallets SET available_balance = available_balance - p_amount WHERE id = v_host_tx.wallet_id;
    END IF;
  END IF;

  IF v_platform_tx.id IS NOT NULL THEN
    INSERT INTO public.wallet_transactions
      (wallet_id, order_id, transaction_type, amount, currency, balance_type, status, description, completed_at)
    VALUES
      (v_platform_tx.wallet_id, p_order_id, 'refund', -v_platform_tx.amount, v_platform_tx.currency, 'available',
       'reversed', COALESCE(p_reason, 'Filmons Fee refund'), now());

    UPDATE public.wallets SET available_balance = available_balance - v_platform_tx.amount WHERE id = v_platform_tx.wallet_id;
  END IF;

  UPDATE public.orders
    SET refund_status = 'refunded', refund_amount = p_amount, refunded_at = now()
    WHERE id = p_order_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Disputed orders' pending earnings never auto-release.
CREATE OR REPLACE FUNCTION public.fn_release_pending_earnings()
RETURNS integer AS $$
DECLARE
  v_row record;
  v_count integer := 0;
BEGIN
  FOR v_row IN
    SELECT wt.* FROM public.wallet_transactions wt
    WHERE wt.balance_type = 'pending' AND wt.status = 'pending' AND wt.available_at IS NOT NULL AND wt.available_at <= now()
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

-- Reserves funds the instant a payout is requested (rather than only at
-- admin approval time) so a second simultaneous request can never draw on
-- the same money. Returns the new payout_requests row id, or raises if the
-- available balance is insufficient.
CREATE OR REPLACE FUNCTION public.fn_request_payout(
  p_host_id uuid,
  p_amount  numeric,
  p_currency text DEFAULT 'CAD',
  p_payout_method text DEFAULT NULL,
  p_payout_destination jsonb DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  v_wallet_id uuid;
  v_available numeric;
  v_payout_id uuid;
BEGIN
  SELECT id, available_balance INTO v_wallet_id, v_available
  FROM public.wallets WHERE owner_type = 'host' AND owner_id = p_host_id AND currency = p_currency
  FOR UPDATE;

  IF v_wallet_id IS NULL OR p_amount <= 0 OR v_available < p_amount THEN
    RAISE EXCEPTION 'Insufficient available balance';
  END IF;

  UPDATE public.wallets SET available_balance = available_balance - p_amount WHERE id = v_wallet_id;

  -- 'processing' here just means "reserved, not yet paid" at the ledger
  -- level — the richer requested/under_review/approved/processing/paid
  -- lifecycle lives on payout_requests.status, not on this entry.
  INSERT INTO public.wallet_transactions
    (wallet_id, transaction_type, amount, currency, balance_type, status, description)
  VALUES (v_wallet_id, 'payout', -p_amount, p_currency, 'available', 'processing', 'Payout requested');

  INSERT INTO public.payout_requests (wallet_id, host_id, amount, currency, status, payout_method, payout_destination)
  VALUES (v_wallet_id, p_host_id, p_amount, p_currency, 'requested', p_payout_method, p_payout_destination)
  RETURNING id INTO v_payout_id;

  RETURN v_payout_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
