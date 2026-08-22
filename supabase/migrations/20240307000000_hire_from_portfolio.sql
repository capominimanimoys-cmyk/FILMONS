-- Hire From Portfolio — negotiation + escrow payment flow. Reuses the
-- Paid Opportunity Payments machinery end to end: same fee-engine
-- isolation via platform_fee_config.context, same orders-row-for-
-- dispute-gating trick, same fn_finalize_*_payment shape, same
-- webhook-confirms-truth doctrine. See fn_finalize_hire_payment's
-- comment for what's reused vs. new.
--
-- Role mapping vs. Opportunity Payments: there the "owner" (listing
-- owner) hires an "applicant"/"worker". Here the REQUESTER (who clicks
-- Hire) is the owner-equivalent (pays), and the HOST (the creator whose
-- portfolio it is) is the applicant/worker-equivalent (does the work,
-- gets paid). Action gating below mirrors manage-application's
-- APPLICANT_GATED/owner-gated split with roles swapped accordingly.

ALTER TABLE public.platform_fee_config ADD COLUMN IF NOT EXISTS context text NOT NULL DEFAULT 'rental';
INSERT INTO public.platform_fee_config (payer, fee_type, rate, version, active, context)
SELECT 'seller', 'percentage', 0.08, '2026.1', true, 'hire'
WHERE NOT EXISTS (SELECT 1 FROM public.platform_fee_config WHERE context = 'hire' AND payer = 'seller');

CREATE TABLE IF NOT EXISTS public.hire_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  requester_id uuid NOT NULL,
  host_id uuid NOT NULL,
  service_listing_id text,
  service_label text NOT NULL,
  is_custom boolean NOT NULL DEFAULT false,
  project_title text NOT NULL,
  description text NOT NULL,
  reference_links text[],
  portfolio_item_id text,
  work_type text NOT NULL CHECK (work_type IN ('on_site','remote','hybrid')),
  street_address text,
  city text,
  province text,
  postal_code text,
  country text,
  date_type text NOT NULL CHECK (date_type IN ('specific','range','flexible')),
  start_date date,
  end_date date,
  start_time text,
  end_time text,
  pricing_type text NOT NULL CHECK (pricing_type IN ('hourly','daily','fixed')),
  use_creator_rate boolean NOT NULL DEFAULT false,
  budget_amount numeric,
  currency text NOT NULL DEFAULT 'CAD',
  message text,
  last_offer_by uuid,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN
    ('sent','countered','accepted','declined','cancelled','expired',
     'payment_pending','hired','completed')),
  viewed_at timestamptz,
  decline_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hire_requests_conversation ON public.hire_requests(conversation_id);
CREATE INDEX IF NOT EXISTS idx_hire_requests_host ON public.hire_requests(host_id);
CREATE INDEX IF NOT EXISTS idx_hire_requests_requester ON public.hire_requests(requester_id);
ALTER TABLE public.hire_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hire_requests_all ON public.hire_requests;
CREATE POLICY hire_requests_all ON public.hire_requests FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.hire_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hire_request_id uuid NOT NULL REFERENCES public.hire_requests(id),
  order_id text REFERENCES public.orders(id),
  requester_id uuid NOT NULL,
  host_id uuid NOT NULL,
  gross_amount numeric NOT NULL,
  fee_rate numeric NOT NULL,
  fee_amount numeric NOT NULL,
  net_amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'CAD',
  initial_release_amount numeric,
  held_amount numeric,
  initial_released_at timestamptz,
  hold_release_at timestamptz,
  hold_released_at timestamptz,
  payment_status text NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending','funded','completed','refunded','cancelled')),
  work_status text NOT NULL DEFAULT 'in_progress' CHECK (work_status IN ('in_progress','marked_complete_by_worker','completed')),
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  funded_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hire_transactions_request ON public.hire_transactions(hire_request_id);
ALTER TABLE public.hire_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hire_transactions_all ON public.hire_transactions;
CREATE POLICY hire_transactions_all ON public.hire_transactions FOR ALL USING (true) WITH CHECK (true);

-- Reuses the same hold/review config as Opportunity Payments rather than
-- a second singleton table -- both are "how many days before the held
-- half auto-releases" with no reason to diverge yet. If they ever need
-- to differ, split this out then.
-- (opportunity_payment_config already exists from 20240305000000_opportunity_payments.sql)

ALTER TABLE public.wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_transaction_type_check;
ALTER TABLE public.wallet_transactions ADD CONSTRAINT wallet_transactions_transaction_type_check
  CHECK (transaction_type IN ('rental_earning','service_earning','sale_earning','filmons_fee','refund','payout',
                               'adjustment','reversal','boost_purchase','instant_payout_fee','opportunity_earning','hire_earning'));

-- Clone of fn_finalize_opportunity_payment (20240305000000_opportunity_payments.sql)
-- -- identical shape: idempotent, get-or-create wallets, paired
-- wallet_transactions+wallets updates, splits net 50/50 into an
-- immediate-available half and a held half. The held half is inserted
-- with balance_type='pending', available_at=hold_release_at, and
-- order_id set -- fn_release_pending_earnings (UNCHANGED, zero new SQL)
-- already knows how to release it once available_at passes AND the
-- linked order isn't disputed.
CREATE OR REPLACE FUNCTION public.fn_finalize_hire_payment(
  p_idempotency_key text, p_transaction_id uuid, p_order_id text,
  p_host_id uuid, p_requester_id uuid,
  p_gross_amount numeric, p_fee_amount numeric, p_net_amount numeric,
  p_currency text, p_hold_review_days integer,
  p_stripe_session_id text, p_stripe_payment_intent_id text
) RETURNS boolean AS $$
DECLARE
  v_host_wallet_id uuid; v_platform_wallet_id uuid;
  v_half numeric := round(p_net_amount / 2, 2);
  v_held numeric := p_net_amount - v_half;
  v_hold_release_at timestamptz := now() + make_interval(days => p_hold_review_days);
BEGIN
  BEGIN
    INSERT INTO public.payment_idempotency_keys (key) VALUES (p_idempotency_key);
  EXCEPTION WHEN unique_violation THEN RETURN false; END;

  INSERT INTO public.wallets (owner_type, owner_id, currency) VALUES ('host', p_host_id, p_currency)
    ON CONFLICT (owner_type, COALESCE(owner_id::text, ''), currency) DO UPDATE SET owner_type = EXCLUDED.owner_type
    RETURNING id INTO v_host_wallet_id;
  INSERT INTO public.wallets (owner_type, owner_id, currency) VALUES ('platform', NULL, p_currency)
    ON CONFLICT (owner_type, COALESCE(owner_id::text, ''), currency) DO UPDATE SET owner_type = EXCLUDED.owner_type
    RETURNING id INTO v_platform_wallet_id;

  INSERT INTO public.wallet_transactions (wallet_id, order_id, transaction_type, amount, currency, balance_type, status, payment_reference, description, completed_at)
  VALUES (v_host_wallet_id, p_order_id, 'hire_earning', v_half, p_currency, 'available', 'available', p_idempotency_key, 'Hire earning (initial release)', now());

  INSERT INTO public.wallet_transactions (wallet_id, order_id, transaction_type, amount, currency, balance_type, status, payment_reference, description, available_at)
  VALUES (v_host_wallet_id, p_order_id, 'hire_earning', v_held, p_currency, 'pending', 'pending', p_idempotency_key, 'Hire earning (held until completion)', v_hold_release_at);

  INSERT INTO public.wallet_transactions (wallet_id, order_id, transaction_type, amount, currency, balance_type, status, payment_reference, description, completed_at)
  VALUES (v_platform_wallet_id, p_order_id, 'filmons_fee', p_fee_amount, p_currency, 'available', 'collected', p_idempotency_key, 'Hire marketplace fee', now());

  UPDATE public.wallets SET available_balance = available_balance + v_half, pending_balance = pending_balance + v_held WHERE id = v_host_wallet_id;
  UPDATE public.wallets SET available_balance = available_balance + p_fee_amount WHERE id = v_platform_wallet_id;

  UPDATE public.hire_transactions SET
    payment_status = 'funded', initial_release_amount = v_half, held_amount = v_held,
    initial_released_at = now(), hold_release_at = v_hold_release_at, funded_at = now(),
    stripe_checkout_session_id = p_stripe_session_id, stripe_payment_intent_id = p_stripe_payment_intent_id,
    updated_at = now()
  WHERE id = p_transaction_id;

  UPDATE public.hire_requests SET status = 'hired', updated_at = now()
  WHERE id = (SELECT hire_request_id FROM public.hire_transactions WHERE id = p_transaction_id);

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
