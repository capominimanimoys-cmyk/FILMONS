-- Host Wallet / Filmons Wallet ledger.
--
-- Replaces the previous fake host-earnings system: cadWalletApi
-- (src/app/lib/fpSystem.ts) was pure localStorage — no Supabase table, no
-- pending/available split, credited directly from the client on every
-- payment path. HostDashboard.tsx papered over this with
-- `Math.max(cadWallet, totalEarned)`. This migration adds a real
-- double-entry-style ledger: every dollar that moves gets a
-- wallet_transactions row, wallet balances are never edited directly by
-- the frontend, and pending vs. available balances are tracked per wallet.
--
-- The frontend never assigns funds — only fn_finalize_payment (called with
-- the service-role key from the Stripe webhook and the cash-payment Edge
-- Function) ever writes to wallets/wallet_transactions.

CREATE TABLE IF NOT EXISTS public.wallets (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type        text NOT NULL CHECK (owner_type IN ('host','platform')),
  owner_id          uuid, -- NULL for the single platform wallet
  currency          text NOT NULL DEFAULT 'CAD',
  pending_balance   numeric NOT NULL DEFAULT 0,
  available_balance numeric NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
-- One wallet per (owner, currency) — NULL owner_id (platform) included via COALESCE.
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallets_owner_currency
  ON public.wallets (owner_type, COALESCE(owner_id::text, ''), currency);

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id        uuid NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  order_id         text,
  transaction_type text NOT NULL CHECK (transaction_type IN
    ('rental_earning','service_earning','sale_earning','filmons_fee','refund','payout','adjustment','reversal')),
  amount           numeric NOT NULL,
  currency         text NOT NULL DEFAULT 'CAD',
  balance_type     text NOT NULL CHECK (balance_type IN ('pending','available')),
  status           text NOT NULL CHECK (status IN ('pending','available','reversed','collected','paid_out')),
  payment_reference text,
  description      text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  available_at     timestamptz, -- when a pending entry is eligible to release (NULL for already-available entries)
  completed_at     timestamptz  -- when it actually released/settled
);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_wallet ON public.wallet_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_order  ON public.wallet_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_release ON public.wallet_transactions(balance_type, available_at) WHERE balance_type = 'pending';

CREATE TABLE IF NOT EXISTS public.payout_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id    uuid NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  host_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount       numeric NOT NULL,
  currency     text NOT NULL DEFAULT 'CAD',
  status       text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','processing','paid','rejected')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processed_by text,
  notes        text
);
CREATE INDEX IF NOT EXISTS idx_payout_requests_host ON public.payout_requests(host_id);
CREATE INDEX IF NOT EXISTS idx_payout_requests_status ON public.payout_requests(status);

-- Idempotency guard shared by the Stripe webhook (keyed on Stripe's event
-- id) and the cash-payment path (keyed on order id) — fn_finalize_payment
-- is a no-op if this key was already processed, so a redelivered webhook
-- event or a duplicate client call can never double-credit a wallet.
CREATE TABLE IF NOT EXISTS public.payment_idempotency_keys (
  key        text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.set_wallets_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_wallets_updated_at ON public.wallets;
CREATE TRIGGER trg_wallets_updated_at
  BEFORE UPDATE ON public.wallets
  FOR EACH ROW EXECUTE FUNCTION public.set_wallets_updated_at();

-- The single place money actually moves. Idempotent (safe to call twice
-- with the same key), and does the get-or-create-wallet + ledger-insert +
-- balance-update as one atomic operation.
CREATE OR REPLACE FUNCTION public.fn_finalize_payment(
  p_idempotency_key   text,
  p_order_id          text,
  p_host_id           uuid,
  p_subtotal          numeric,
  p_seller_fee_amount numeric,
  p_buyer_fee_amount  numeric,
  p_currency          text DEFAULT 'CAD',
  p_available_at      timestamptz DEFAULT (now() + interval '48 hours')
) RETURNS boolean AS $$
DECLARE
  v_host_wallet_id     uuid;
  v_platform_wallet_id uuid;
  v_host_net           numeric := p_subtotal - p_seller_fee_amount;
  v_platform_fee_total numeric := p_buyer_fee_amount + p_seller_fee_amount;
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
    (wallet_id, order_id, transaction_type, amount, currency, balance_type, status, payment_reference, description, available_at)
  VALUES
    (v_host_wallet_id, p_order_id, 'rental_earning', v_host_net, p_currency, 'pending', 'pending', p_idempotency_key, 'Rental earning', p_available_at);

  INSERT INTO public.wallet_transactions
    (wallet_id, order_id, transaction_type, amount, currency, balance_type, status, payment_reference, description, completed_at)
  VALUES
    (v_platform_wallet_id, p_order_id, 'filmons_fee', v_platform_fee_total, p_currency, 'available', 'collected', p_idempotency_key, 'Filmons Fee', now());

  UPDATE public.wallets SET pending_balance = pending_balance + v_host_net WHERE id = v_host_wallet_id;
  UPDATE public.wallets SET available_balance = available_balance + v_platform_fee_total WHERE id = v_platform_wallet_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Releases pending host earnings whose available_at has passed. Called by
-- release-pending-earnings on a schedule (see .github/workflows).
CREATE OR REPLACE FUNCTION public.fn_release_pending_earnings()
RETURNS integer AS $$
DECLARE
  v_row record;
  v_count integer := 0;
BEGIN
  FOR v_row IN
    SELECT * FROM public.wallet_transactions
    WHERE balance_type = 'pending' AND status = 'pending' AND available_at IS NOT NULL AND available_at <= now()
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

-- RLS: same app-enforced model as every other table here (no real
-- auth.uid() — see project_auth_model). The frontend never issues
-- INSERT/UPDATE against these tables in code — only SELECT — so this open
-- policy is a formality matching the rest of the schema, not the real
-- boundary; the real boundary is that only fn_finalize_payment/
-- fn_release_pending_earnings (called with the service-role key) ever
-- write balances.
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wallets_all" ON public.wallets;
CREATE POLICY "wallets_all" ON public.wallets FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wallet_transactions_all" ON public.wallet_transactions;
CREATE POLICY "wallet_transactions_all" ON public.wallet_transactions FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payout_requests_all" ON public.payout_requests;
CREATE POLICY "payout_requests_all" ON public.payout_requests FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.payment_idempotency_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payment_idempotency_keys_all" ON public.payment_idempotency_keys;
CREATE POLICY "payment_idempotency_keys_all" ON public.payment_idempotency_keys FOR ALL USING (true) WITH CHECK (true);

-- Seed the single platform wallet up front.
INSERT INTO public.wallets (owner_type, owner_id, currency)
VALUES ('platform', NULL, 'CAD')
ON CONFLICT (owner_type, COALESCE(owner_id::text, ''), currency) DO NOTHING;
