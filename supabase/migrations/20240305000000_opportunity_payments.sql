-- Paid Opportunity payments: hire -> offer -> fund -> 50/50 escrow ->
-- completion -> release. Reuses this app's existing payment machinery end
-- to end (Checkout-Session-then-webhook-confirms, the fee engine, the
-- pending->available release cron, the orders.dispute_status freeze) --
-- see fn_finalize_opportunity_payment's comment for exactly what's reused.
--
-- IMPORTANT: platform_fee_config currently has exactly one active row
-- (payer='buyer', rate=0.08) used for EVERY rental. Simply adding an
-- active payer='seller' row for the new 8% Opportunity fee would silently
-- start deducting 8% from every rental host's payout too, since
-- computeBreakdown() had no way to scope a row to just Opportunities.
-- The new `context` column isolates it -- existing rows default to
-- 'rental', so this migration provably cannot change any existing
-- rental fee calculation.
ALTER TABLE public.platform_fee_config ADD COLUMN IF NOT EXISTS context text NOT NULL DEFAULT 'rental';
INSERT INTO public.platform_fee_config (payer, fee_type, rate, version, active, context)
SELECT 'seller', 'percentage', 0.08, '2026.1', true, 'opportunity'
WHERE NOT EXISTS (SELECT 1 FROM public.platform_fee_config WHERE context = 'opportunity' AND payer = 'seller');

-- Application lifecycle gains the hire/offer/payment states. Payment state
-- itself is tracked separately on opportunity_transactions.payment_status
-- -- this column is workflow/UI only, never the source of truth for money.
ALTER TABLE public.opportunity_applications DROP CONSTRAINT IF EXISTS opportunity_applications_status_check;
ALTER TABLE public.opportunity_applications ADD CONSTRAINT opportunity_applications_status_check
  CHECK (status IN ('pending','viewed','shortlisted','contacted','accepted','rejected','withdrawn',
                     'selected','offer_sent','offer_accepted','payment_pending','hired','completed'));

CREATE TABLE IF NOT EXISTS public.opportunity_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.opportunity_applications(id),
  listing_id text NOT NULL,
  order_id text REFERENCES public.orders(id), -- links to a real orders row so dispute-gating (fn_release_pending_earnings) and admin volume/revenue reporting work with zero new code
  owner_id uuid NOT NULL,
  worker_id uuid NOT NULL,
  gross_amount numeric NOT NULL,
  fee_rate numeric NOT NULL,
  fee_amount numeric NOT NULL,
  net_amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'CAD',
  initial_release_amount numeric,
  held_amount numeric,
  initial_released_at timestamptz,
  hold_release_at timestamptz,   -- target auto-release date, set at funding time
  hold_released_at timestamptz,  -- actual release timestamp, once it happens
  payment_status text NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending','funded','completed','refunded','cancelled')),
  work_status text NOT NULL DEFAULT 'in_progress' CHECK (work_status IN ('in_progress','marked_complete_by_worker','completed')),
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  funded_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_opportunity_transactions_application ON public.opportunity_transactions(application_id);
ALTER TABLE public.opportunity_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS opportunity_transactions_all ON public.opportunity_transactions;
CREATE POLICY opportunity_transactions_all ON public.opportunity_transactions FOR ALL USING (true) WITH CHECK (true);

-- Configurable hold/review period -- never hardcoded, matching this
-- session's established convention (boost_config, payout_config, entitlements).
CREATE TABLE IF NOT EXISTS public.opportunity_payment_config (
  id int PRIMARY KEY DEFAULT 1,
  hold_review_days integer NOT NULL DEFAULT 7,
  updated_at timestamptz DEFAULT now()
);
INSERT INTO public.opportunity_payment_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.opportunity_payment_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS opportunity_payment_config_select ON public.opportunity_payment_config;
CREATE POLICY opportunity_payment_config_select ON public.opportunity_payment_config FOR SELECT USING (true);

ALTER TABLE public.wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_transaction_type_check;
ALTER TABLE public.wallet_transactions ADD CONSTRAINT wallet_transactions_transaction_type_check
  CHECK (transaction_type IN ('rental_earning','service_earning','sale_earning','filmons_fee','refund','payout','adjustment','reversal','boost_purchase','instant_payout_fee','opportunity_earning'));

-- Mirrors fn_finalize_payment's shape (idempotent, get-or-create wallets,
-- paired wallet_transactions+wallets updates) but splits the worker's net
-- into an immediate-available half and a held half. The held half is
-- inserted with balance_type='pending', available_at=hold_release_at, and
-- order_id set -- fn_release_pending_earnings (UNCHANGED, zero new SQL)
-- already knows how to release it once available_at passes AND the
-- linked order isn't disputed.
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
BEGIN
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
    stripe_checkout_session_id = p_stripe_session_id, stripe_payment_intent_id = p_stripe_payment_intent_id,
    updated_at = now()
  WHERE id = p_transaction_id;

  UPDATE public.opportunity_applications SET status = 'hired'
  WHERE id = (SELECT application_id FROM public.opportunity_transactions WHERE id = p_transaction_id);

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
