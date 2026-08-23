-- Auto-release: if the worker/host marks a paid Opportunity or Hire
-- complete and the owner takes no action (confirm or dispute) for
-- auto_release_days, release the held funds automatically -- with a
-- reminder notification sent one day before that happens. Configurable
-- via the same singleton config table Opportunity/Hire payments already
-- share (opportunity_payment_config), never hardcoded.

ALTER TABLE public.opportunity_payment_config ADD COLUMN IF NOT EXISTS auto_release_days integer NOT NULL DEFAULT 5;

ALTER TABLE public.opportunity_transactions ADD COLUMN IF NOT EXISTS marked_complete_at timestamptz;
ALTER TABLE public.opportunity_transactions ADD COLUMN IF NOT EXISTS auto_release_reminder_sent boolean NOT NULL DEFAULT false;

ALTER TABLE public.hire_transactions ADD COLUMN IF NOT EXISTS marked_complete_at timestamptz;
ALTER TABLE public.hire_transactions ADD COLUMN IF NOT EXISTS auto_release_reminder_sent boolean NOT NULL DEFAULT false;

-- Releases funds automatically once the window has elapsed. Mirrors
-- confirm_completion's own effect exactly (flip work_status, stamp
-- completed_at/hold_released_at, flip the held wallet_transactions row's
-- available_at) so fn_release_pending_earnings's existing hourly pass
-- still does the actual pending->available move -- zero new release
-- code, and a disputed order is skipped exactly like every other path
-- already respects.
CREATE OR REPLACE FUNCTION public.fn_auto_release_opportunity_payments()
RETURNS TABLE(application_id uuid, worker_id uuid, owner_id uuid, net_amount numeric, listing_id text) AS $$
DECLARE
  v_auto_release_days integer;
BEGIN
  SELECT auto_release_days INTO v_auto_release_days FROM public.opportunity_payment_config WHERE id = 1;
  v_auto_release_days := COALESCE(v_auto_release_days, 5);

  RETURN QUERY
  WITH released AS (
    UPDATE public.opportunity_transactions t SET
      work_status = 'completed', completed_at = now(), hold_released_at = now(), updated_at = now()
    FROM public.opportunity_applications a
    LEFT JOIN public.orders o ON o.id = t.order_id
    WHERE t.application_id = a.id
      AND t.payment_status = 'funded' AND t.work_status = 'marked_complete_by_worker'
      AND t.marked_complete_at IS NOT NULL
      AND t.marked_complete_at + make_interval(days => v_auto_release_days) <= now()
      AND (o.dispute_status IS NULL OR o.dispute_status != 'disputed')
    RETURNING t.application_id, t.worker_id, t.owner_id, t.net_amount, t.listing_id, t.order_id
  )
  UPDATE public.wallet_transactions wt SET available_at = now()
  FROM released r
  WHERE wt.order_id = r.order_id AND wt.transaction_type = 'opportunity_earning' AND wt.balance_type = 'pending'
  RETURNING r.application_id, r.worker_id, r.owner_id, r.net_amount, r.listing_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.fn_auto_release_hire_payments()
RETURNS TABLE(hire_request_id uuid, host_id uuid, requester_id uuid, net_amount numeric) AS $$
DECLARE
  v_auto_release_days integer;
BEGIN
  SELECT auto_release_days INTO v_auto_release_days FROM public.opportunity_payment_config WHERE id = 1;
  v_auto_release_days := COALESCE(v_auto_release_days, 5);

  RETURN QUERY
  WITH released AS (
    UPDATE public.hire_transactions t SET
      work_status = 'completed', completed_at = now(), hold_released_at = now(), updated_at = now()
    FROM public.hire_requests hr
    LEFT JOIN public.orders o ON o.id = t.order_id
    WHERE t.hire_request_id = hr.id
      AND t.payment_status = 'funded' AND t.work_status = 'marked_complete_by_worker'
      AND t.marked_complete_at IS NOT NULL
      AND t.marked_complete_at + make_interval(days => v_auto_release_days) <= now()
      AND (o.dispute_status IS NULL OR o.dispute_status != 'disputed')
    RETURNING t.hire_request_id, t.host_id, t.requester_id, t.net_amount, t.order_id
  )
  UPDATE public.wallet_transactions wt SET available_at = now()
  FROM released r
  WHERE wt.order_id = r.order_id AND wt.transaction_type = 'hire_earning' AND wt.balance_type = 'pending'
  RETURNING r.hire_request_id, r.host_id, r.requester_id, r.net_amount;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- One reminder, one day before auto-release — auto_release_reminder_sent
-- guards against re-sending on every hourly tick.
CREATE OR REPLACE FUNCTION public.fn_opportunity_auto_release_reminders()
RETURNS TABLE(application_id uuid, owner_id uuid, listing_id text, days_left integer) AS $$
DECLARE
  v_auto_release_days integer;
BEGIN
  SELECT auto_release_days INTO v_auto_release_days FROM public.opportunity_payment_config WHERE id = 1;
  v_auto_release_days := COALESCE(v_auto_release_days, 5);

  RETURN QUERY
  UPDATE public.opportunity_transactions t SET auto_release_reminder_sent = true
  FROM public.orders o
  WHERE t.order_id = o.id
    AND t.payment_status = 'funded' AND t.work_status = 'marked_complete_by_worker'
    AND t.auto_release_reminder_sent = false
    AND t.marked_complete_at IS NOT NULL
    AND t.marked_complete_at + make_interval(days => v_auto_release_days - 1) <= now()
    AND (o.dispute_status IS NULL OR o.dispute_status != 'disputed')
  RETURNING t.application_id, t.owner_id, t.listing_id, 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.fn_hire_auto_release_reminders()
RETURNS TABLE(hire_request_id uuid, requester_id uuid, days_left integer) AS $$
DECLARE
  v_auto_release_days integer;
BEGIN
  SELECT auto_release_days INTO v_auto_release_days FROM public.opportunity_payment_config WHERE id = 1;
  v_auto_release_days := COALESCE(v_auto_release_days, 5);

  RETURN QUERY
  UPDATE public.hire_transactions t SET auto_release_reminder_sent = true
  FROM public.orders o
  WHERE t.order_id = o.id
    AND t.payment_status = 'funded' AND t.work_status = 'marked_complete_by_worker'
    AND t.auto_release_reminder_sent = false
    AND t.marked_complete_at IS NOT NULL
    AND t.marked_complete_at + make_interval(days => v_auto_release_days - 1) <= now()
    AND (o.dispute_status IS NULL OR o.dispute_status != 'disputed')
  RETURNING t.hire_request_id, t.requester_id, 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
