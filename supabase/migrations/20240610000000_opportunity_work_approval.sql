-- Paid Opportunity work approval: payment confirmed -> work in progress ->
-- applicant marks work submitted -> client approves -> payment released.
-- Work can be delivered outside FILMONS; nothing here depends on uploads.
--
-- opportunity_transactions IS the work record: one row per hired
-- applicant (application_id), already linking the opportunity
-- (listing_id), the paying client (owner_id), the hired applicant
-- (worker_id) and the payment (order_id + Stripe ids). A row only counts
-- as a work record once payment_status reaches 'funded' (set by
-- fn_finalize_opportunity_payment from the Stripe webhook), so "create a
-- work record after payment is confirmed" is exactly that transition.
-- Multiple hires on one Opportunity are separate rows, tracked separately.
--
-- Work approval and payment state are deliberately separate columns:
--   work_status    in_progress -> marked_complete_by_worker (submitted) -> completed (approved)
--   release_status held -> processing (approved, release requested) -> available (withdrawable)
-- release_status only reaches 'available' when the worker's wallet row
-- actually moves to balance_type='available' (trigger below), so a Stripe
-- settlement delay can never show up as withdrawable earnings.

ALTER TABLE public.opportunity_transactions
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approval_method text CHECK (approval_method IN ('client','auto')),
  ADD COLUMN IF NOT EXISTS release_status text NOT NULL DEFAULT 'held' CHECK (release_status IN ('held','processing','available')),
  ADD COLUMN IF NOT EXISTS release_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS release_available_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_approval_reminder_at timestamptz,
  ADD COLUMN IF NOT EXISTS approval_reminder_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS available_notified_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_opportunity_transactions_owner ON public.opportunity_transactions(owner_id);
CREATE INDEX IF NOT EXISTS idx_opportunity_transactions_worker ON public.opportunity_transactions(worker_id);
CREATE INDEX IF NOT EXISTS idx_opportunity_transactions_order ON public.opportunity_transactions(order_id);

-- opportunity_transactions.order_id was never written: the webhook creates
-- the orders row as 'OPP-' || transaction id and fn_finalize_opportunity_
-- payment didn't store it back, so every order_id-keyed step (completion
-- release, report_problem's dispute freeze, auto-release) matched nothing.
-- Backfill it (the FK needs the orders row to exist) and store it going
-- forward (fn_finalize_opportunity_payment below).
UPDATE public.opportunity_transactions t SET order_id = 'OPP-' || t.id::text
WHERE t.order_id IS NULL
  AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id = 'OPP-' || t.id::text);

-- Backfill rows already confirmed complete under the old flow.
UPDATE public.opportunity_transactions t SET
  approved_at = COALESCE(t.approved_at, t.completed_at),
  release_requested_at = COALESCE(t.release_requested_at, t.completed_at),
  release_status = CASE
    WHEN EXISTS (SELECT 1 FROM public.wallet_transactions w
                 WHERE w.order_id = t.order_id AND w.transaction_type = 'opportunity_earning' AND w.balance_type = 'pending')
      THEN 'processing'
    ELSE 'available'
  END
WHERE t.work_status = 'completed' AND t.release_status = 'held';
-- Already-released history never gets a fresh "now available" notification.
UPDATE public.opportunity_transactions SET available_notified_at = COALESCE(completed_at, now())
WHERE release_status = 'available' AND available_notified_at IS NULL;

-- Writes only ever go through the service role (manage-application,
-- stripe-webhook, release-pending-earnings) or the SECURITY DEFINER
-- functions below. The previous FOR ALL USING (true) policy let any
-- client PATCH work_status/payment_status directly, which would bypass
-- every ownership and duplicate-action guard in this flow.
DROP POLICY IF EXISTS opportunity_transactions_all ON public.opportunity_transactions;
DROP POLICY IF EXISTS opportunity_transactions_select ON public.opportunity_transactions;
CREATE POLICY opportunity_transactions_select ON public.opportunity_transactions FOR SELECT USING (true);

-- Explicit, configurable auto-approval policy (the existing
-- auto_release_days window). auto_approval_enabled = false means payment
-- is only ever released by the client's own approval; reminders continue
-- every approval_reminder_hours until they act.
ALTER TABLE public.opportunity_payment_config ADD COLUMN IF NOT EXISTS auto_approval_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.opportunity_payment_config ADD COLUMN IF NOT EXISTS approval_reminder_hours integer NOT NULL DEFAULT 24;

-- Server-side duplicate-notification guard for the one-shot work events.
-- Reminders (work_approval_reminder) are intentionally repeatable.
DROP INDEX IF EXISTS public.idx_notifications_application_dedup;
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_application_dedup
  ON public.notifications(user_id, type, application_id)
  WHERE type IN ('application_shortlisted', 'application_accepted', 'application_rejected', 'application_withdrawn',
                 'work_submitted', 'work_approved', 'work_payment_available')
    AND application_id IS NOT NULL;

-- ── Funding (webhook) ────────────────────────────────────────────────────
-- 20240405's version, unchanged except it now records order_id on the
-- work record, and the held row's available_at no longer matters on its
-- own: fn_release_pending_earnings won't release it until approval.
CREATE OR REPLACE FUNCTION public.fn_finalize_opportunity_payment(
  p_idempotency_key text, p_transaction_id uuid, p_order_id text,
  p_worker_id uuid, p_owner_id uuid,
  p_gross_amount numeric, p_fee_amount numeric, p_net_amount numeric,
  p_currency text, p_hold_review_days integer,
  p_stripe_session_id text, p_stripe_payment_intent_id text,
  p_stripe_charge_id text DEFAULT NULL,
  p_stripe_balance_transaction_id text DEFAULT NULL,
  p_stripe_available_on timestamptz DEFAULT NULL
) RETURNS boolean AS $$
DECLARE
  v_worker_wallet_id uuid; v_platform_wallet_id uuid;
  v_hold_release_at timestamptz := now() + make_interval(days => p_hold_review_days);
  v_available_at timestamptz := GREATEST(now() + make_interval(days => p_hold_review_days), COALESCE(p_stripe_available_on, now() + make_interval(days => p_hold_review_days)));
  v_payout_status text := CASE
    WHEN p_stripe_balance_transaction_id IS NULL THEN NULL
    WHEN p_stripe_available_on IS NOT NULL AND p_stripe_available_on <= now() THEN 'available'
    ELSE 'pending'
  END;
  v_already_funded boolean;
BEGIN
  SELECT (payment_status = 'funded') INTO v_already_funded FROM public.opportunity_transactions WHERE id = p_transaction_id;
  IF v_already_funded THEN RETURN false; END IF;

  BEGIN
    INSERT INTO public.payment_idempotency_keys (key) VALUES (p_idempotency_key);
  EXCEPTION WHEN unique_violation THEN RETURN false; END;

  INSERT INTO public.wallets (owner_type, owner_id, currency) VALUES ('host', p_worker_id, p_currency)
    ON CONFLICT (owner_type, COALESCE(owner_id::text, ''), currency) DO UPDATE SET owner_type = EXCLUDED.owner_type
    RETURNING id INTO v_worker_wallet_id;
  INSERT INTO public.wallets (owner_type, owner_id, currency) VALUES ('platform', NULL, p_currency)
    ON CONFLICT (owner_type, COALESCE(owner_id::text, ''), currency) DO UPDATE SET owner_type = EXCLUDED.owner_type
    RETURNING id INTO v_platform_wallet_id;

  INSERT INTO public.wallet_transactions
    (wallet_id, order_id, transaction_type, amount, currency, balance_type, status, payment_reference, description, available_at,
     stripe_payment_intent_id, stripe_charge_id, stripe_balance_transaction_id, stripe_available_on, payout_availability_status)
  VALUES
    (v_worker_wallet_id, p_order_id, 'opportunity_earning', p_net_amount, p_currency, 'pending', 'pending', p_idempotency_key, 'Opportunity earning (held until work is approved)', v_available_at,
     p_stripe_payment_intent_id, p_stripe_charge_id, p_stripe_balance_transaction_id, p_stripe_available_on, v_payout_status);

  INSERT INTO public.wallet_transactions (wallet_id, order_id, transaction_type, amount, currency, balance_type, status, payment_reference, description, completed_at)
  VALUES (v_platform_wallet_id, p_order_id, 'filmons_fee', p_fee_amount, p_currency, 'available', 'collected', p_idempotency_key, 'Opportunity marketplace fee', now());

  UPDATE public.wallets SET pending_balance = pending_balance + p_net_amount WHERE id = v_worker_wallet_id;
  UPDATE public.wallets SET available_balance = available_balance + p_fee_amount WHERE id = v_platform_wallet_id;

  UPDATE public.opportunity_transactions SET
    order_id = p_order_id,
    payment_status = 'funded', initial_release_amount = 0, held_amount = p_net_amount,
    initial_released_at = now(), hold_release_at = v_hold_release_at, funded_at = now(),
    stripe_checkout_session_id = p_stripe_session_id, stripe_payment_intent_id = p_stripe_payment_intent_id,
    work_status = 'in_progress', release_status = 'held', updated_at = now()
  WHERE id = p_transaction_id;

  UPDATE public.opportunity_applications SET status = 'hired' WHERE id = (SELECT application_id FROM public.opportunity_transactions WHERE id = p_transaction_id);

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

-- ── Submit ───────────────────────────────────────────────────────────────
-- Conditional UPDATE is the duplicate guard: only the hired applicant, only
-- on a funded hire, only from in_progress. A second call (double tap,
-- retry, another tab) matches nothing and returns no row.
CREATE OR REPLACE FUNCTION public.fn_submit_opportunity_work(p_application_id uuid, p_worker_id uuid)
RETURNS SETOF public.opportunity_transactions AS $$
  UPDATE public.opportunity_transactions SET
    work_status = 'marked_complete_by_worker',
    marked_complete_at = now(),
    auto_release_reminder_sent = false,
    last_approval_reminder_at = NULL,
    approval_reminder_count = 0,
    updated_at = now()
  WHERE application_id = p_application_id
    AND worker_id = p_worker_id
    AND payment_status = 'funded'
    AND work_status = 'in_progress'
  RETURNING *;
$$ LANGUAGE sql SECURITY DEFINER;

-- ── Approve ──────────────────────────────────────────────────────────────
-- Only the paying client, only once, only after submission. Marks the
-- work approved and requests release; the actual pending->available move
-- happens in fn_release_opportunity_earning / fn_release_pending_earnings,
-- which still respect Stripe settlement and disputes.
CREATE OR REPLACE FUNCTION public.fn_approve_opportunity_work(p_application_id uuid, p_owner_id uuid)
RETURNS SETOF public.opportunity_transactions AS $$
DECLARE
  v_txn public.opportunity_transactions;
BEGIN
  UPDATE public.opportunity_transactions SET
    work_status = 'completed',
    completed_at = now(),
    hold_released_at = now(),
    approved_at = now(),
    approved_by = p_owner_id,
    approval_method = 'client',
    release_status = 'processing',
    release_requested_at = now(),
    updated_at = now()
  WHERE application_id = p_application_id
    AND owner_id = p_owner_id
    AND payment_status = 'funded'
    AND work_status = 'marked_complete_by_worker'
  RETURNING * INTO v_txn;

  IF NOT FOUND THEN RETURN; END IF;

  -- Never earlier than Stripe's own settlement date.
  UPDATE public.wallet_transactions SET available_at = GREATEST(now(), COALESCE(stripe_available_on, now()))
  WHERE order_id = v_txn.order_id AND transaction_type = 'opportunity_earning'
    AND balance_type = 'pending' AND status = 'pending';

  UPDATE public.opportunity_applications SET status = 'completed' WHERE id = p_application_id;

  RETURN NEXT v_txn;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Release gate ─────────────────────────────────────────────────────────
-- Same as 20240405's version plus one clause: an opportunity_earning row is
-- never released while its work record isn't approved. Previously the held
-- row's available_at (funding + hold_review_days) let the hourly cron
-- release it even if the work was never submitted or approved.
CREATE OR REPLACE FUNCTION public.fn_release_pending_earnings()
RETURNS integer AS $$
DECLARE
  v_row record;
  v_count integer := 0;
BEGIN
  FOR v_row IN
    SELECT wt.* FROM public.wallet_transactions wt
    WHERE wt.balance_type = 'pending' AND wt.status = 'pending' AND wt.available_at IS NOT NULL AND wt.available_at <= now()
      AND wt.payout_availability_status IS DISTINCT FROM 'pending'
      AND NOT EXISTS (
        SELECT 1 FROM public.orders o WHERE o.id = wt.order_id AND o.dispute_status = 'disputed'
      )
      AND NOT (
        wt.transaction_type = 'opportunity_earning' AND EXISTS (
          SELECT 1 FROM public.opportunity_transactions t
          WHERE COALESCE(t.order_id, 'OPP-' || t.id::text) = wt.order_id AND t.work_status <> 'completed'
        )
      )
  LOOP
    -- balance_type re-checked so a row fn_release_opportunity_earning
    -- released between this SELECT and UPDATE is never credited twice.
    UPDATE public.wallet_transactions
      SET balance_type = 'available', status = 'available', completed_at = now()
      WHERE id = v_row.id AND balance_type = 'pending';
    CONTINUE WHEN NOT FOUND;

    UPDATE public.wallets
      SET pending_balance = pending_balance - v_row.amount,
          available_balance = available_balance + v_row.amount
      WHERE id = v_row.wallet_id;

    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Releases one approved opportunity's earning immediately (called right
-- after approval, once Stripe availability has been re-checked), under
-- exactly the same gates as fn_release_pending_earnings. Returns the
-- resulting release_status: 'available' or 'processing'. Row-locked so a
-- concurrent cron tick can't double-credit the wallet.
CREATE OR REPLACE FUNCTION public.fn_release_opportunity_earning(p_order_id text)
RETURNS text AS $$
DECLARE
  v_row record;
  v_status text;
BEGIN
  FOR v_row IN
    SELECT wt.* FROM public.wallet_transactions wt
    WHERE wt.order_id = p_order_id AND wt.transaction_type = 'opportunity_earning'
      AND wt.balance_type = 'pending' AND wt.status = 'pending'
      AND wt.available_at IS NOT NULL AND wt.available_at <= now()
      AND wt.payout_availability_status IS DISTINCT FROM 'pending'
      AND NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = wt.order_id AND o.dispute_status = 'disputed')
      AND EXISTS (SELECT 1 FROM public.opportunity_transactions t WHERE t.order_id = wt.order_id AND t.work_status = 'completed')
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.wallet_transactions
      SET balance_type = 'available', status = 'available', completed_at = now()
      WHERE id = v_row.id AND balance_type = 'pending';
    IF FOUND THEN
      UPDATE public.wallets
        SET pending_balance = pending_balance - v_row.amount,
            available_balance = available_balance + v_row.amount
        WHERE id = v_row.wallet_id;
    END IF;
  END LOOP;

  SELECT release_status INTO v_status FROM public.opportunity_transactions WHERE order_id = p_order_id LIMIT 1;
  RETURN COALESCE(v_status, 'processing');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Keeps release_status in lockstep with the wallet ledger no matter which
-- path released the money (approval, cron, admin): 'available' is set
-- only when no opportunity_earning row for that order is still pending.
CREATE OR REPLACE FUNCTION public.fn_sync_opportunity_release_status()
RETURNS trigger AS $$
BEGIN
  IF NEW.transaction_type = 'opportunity_earning' AND NEW.order_id IS NOT NULL
     AND NEW.balance_type = 'available' AND OLD.balance_type IS DISTINCT FROM 'available' THEN
    UPDATE public.opportunity_transactions t SET
      release_status = 'available', release_available_at = now(), updated_at = now()
    WHERE t.order_id = NEW.order_id AND t.release_status <> 'available'
      AND NOT EXISTS (
        SELECT 1 FROM public.wallet_transactions w
        WHERE w.order_id = NEW.order_id AND w.transaction_type = 'opportunity_earning'
          AND w.balance_type = 'pending' AND w.id <> NEW.id
      );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_opportunity_release_status ON public.wallet_transactions;
CREATE TRIGGER trg_sync_opportunity_release_status
  AFTER UPDATE OF balance_type ON public.wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_opportunity_release_status();

-- ── Auto-approval (explicit policy only) ─────────────────────────────────
-- Same window as before (auto_release_days after submission), now gated on
-- auto_approval_enabled, recorded as approval_method = 'auto', and kept in
-- step with the application row. Return shape gains order_id so the cron
-- can run the same provider release step as a manual approval.
DROP FUNCTION IF EXISTS public.fn_auto_release_opportunity_payments();
CREATE FUNCTION public.fn_auto_release_opportunity_payments()
RETURNS TABLE(application_id uuid, worker_id uuid, owner_id uuid, net_amount numeric, listing_id text, order_id text) AS $$
DECLARE
  v_auto_release_days integer;
  v_enabled boolean;
BEGIN
  SELECT c.auto_release_days, c.auto_approval_enabled INTO v_auto_release_days, v_enabled
  FROM public.opportunity_payment_config c WHERE c.id = 1;
  IF NOT COALESCE(v_enabled, false) THEN RETURN; END IF;
  v_auto_release_days := COALESCE(v_auto_release_days, 5);

  RETURN QUERY
  WITH released AS (
    UPDATE public.opportunity_transactions t SET
      work_status = 'completed', completed_at = now(), hold_released_at = now(),
      approved_at = now(), approval_method = 'auto',
      release_status = 'processing', release_requested_at = now(), updated_at = now()
    WHERE t.payment_status = 'funded' AND t.work_status = 'marked_complete_by_worker'
      AND t.marked_complete_at IS NOT NULL
      AND t.marked_complete_at + make_interval(days => v_auto_release_days) <= now()
      AND NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = t.order_id AND o.dispute_status = 'disputed')
    RETURNING t.application_id, t.worker_id, t.owner_id, t.net_amount, t.listing_id, t.order_id
  ), apps AS (
    UPDATE public.opportunity_applications a SET status = 'completed'
    FROM released r WHERE a.id = r.application_id
    RETURNING a.id
  ), wallet AS (
    UPDATE public.wallet_transactions wt SET available_at = GREATEST(now(), COALESCE(wt.stripe_available_on, now()))
    FROM released r
    WHERE wt.order_id = r.order_id AND wt.transaction_type = 'opportunity_earning' AND wt.balance_type = 'pending'
    RETURNING wt.id
  )
  SELECT r.application_id, r.worker_id, r.owner_id, r.net_amount, r.listing_id, r.order_id FROM released r;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Approval reminders ───────────────────────────────────────────────────
-- Recurring (every approval_reminder_hours) while work is submitted and
-- not yet approved or disputed — replaces the single one-day-before
-- reminder for Opportunities. auto_release_at is NULL when auto-approval
-- is off, so the reminder never promises an automatic release.
CREATE OR REPLACE FUNCTION public.fn_opportunity_approval_reminders()
RETURNS TABLE(application_id uuid, owner_id uuid, worker_id uuid, listing_id text, gross_amount numeric, reminder_count integer, auto_release_at timestamptz) AS $$
DECLARE
  v_hours integer;
  v_days integer;
  v_enabled boolean;
BEGIN
  SELECT c.approval_reminder_hours, c.auto_release_days, c.auto_approval_enabled INTO v_hours, v_days, v_enabled
  FROM public.opportunity_payment_config c WHERE c.id = 1;
  v_hours := GREATEST(COALESCE(v_hours, 24), 1);
  v_days := COALESCE(v_days, 5);

  RETURN QUERY
  UPDATE public.opportunity_transactions t SET
    last_approval_reminder_at = now(),
    approval_reminder_count = t.approval_reminder_count + 1,
    auto_release_reminder_sent = true
  WHERE t.payment_status = 'funded' AND t.work_status = 'marked_complete_by_worker'
    AND t.marked_complete_at IS NOT NULL
    AND COALESCE(t.last_approval_reminder_at, t.marked_complete_at) + make_interval(hours => v_hours) <= now()
    AND NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = t.order_id AND o.dispute_status = 'disputed')
  RETURNING t.application_id, t.owner_id, t.worker_id, t.listing_id, t.gross_amount, t.approval_reminder_count,
    CASE WHEN COALESCE(v_enabled, false) THEN t.marked_complete_at + make_interval(days => v_days) ELSE NULL END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── "Now available" notifications ────────────────────────────────────────
-- Claims each work record whose earning has become withdrawable since the
-- last pass, exactly once, so the applicant hears about it when a
-- 'processing' release finally settles (often on a later hourly tick).
CREATE OR REPLACE FUNCTION public.fn_claim_opportunity_available_notifications()
RETURNS TABLE(application_id uuid, worker_id uuid, owner_id uuid, listing_id text, net_amount numeric) AS $$
  UPDATE public.opportunity_transactions t SET available_notified_at = now()
  WHERE t.release_status = 'available' AND t.available_notified_at IS NULL
  RETURNING t.application_id, t.worker_id, t.owner_id, t.listing_id, t.net_amount;
$$ LANGUAGE sql SECURITY DEFINER;
