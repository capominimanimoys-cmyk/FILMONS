-- Opportunity monthly entitlements (Creator/Creator+ 2/2, Professional 5/5,
-- Business unlimited) plus real Stripe subscription billing for
-- Professional/Business. Limits are monthly-submission counts, not
-- active-listing counts -- a deleted/closed/withdrawn/declined row still
-- counts toward that month's usage, otherwise publish->delete->publish or
-- apply->withdraw->apply would trivially bypass the limit.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS subscription_status text, -- 'active' | 'canceled' | null
  ADD COLUMN IF NOT EXISTS subscription_current_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_cancel_at_period_end boolean DEFAULT false;

-- Race-safe (pg_advisory_xact_lock keyed on applicant+month) count-then-insert
-- -- this app's one existing precedent for a money/limit-integrity race is
-- fn_request_payout's SELECT...FOR UPDATE (20240218000000_refunds_disputes.sql);
-- an advisory lock serves the same purpose here since there's no existing row
-- to lock for a brand-new month. p_limit is passed in by the caller (the edge
-- function), resolved from the ONE canonical entitlements table in
-- supabase/functions/_shared/entitlements.ts -- this function stays generic
-- and never re-derives tier/pricing logic itself. p_limit = NULL means unlimited.
CREATE OR REPLACE FUNCTION fn_submit_opportunity_application(
  p_applicant_id uuid, p_listing_id text, p_owner_id uuid, p_limit integer,
  p_message text, p_portfolio_url text, p_resume_url text, p_demo_reel_url text,
  p_availability text, p_expected_rate text, p_custom_answers jsonb
) RETURNS public.opportunity_applications AS $$
DECLARE
  v_count integer;
  v_row public.opportunity_applications;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_applicant_id::text || to_char(now(), 'YYYY-MM') || ':apply'));
  IF p_limit IS NOT NULL THEN
    SELECT count(*) INTO v_count FROM public.opportunity_applications
      WHERE applicant_id = p_applicant_id AND created_at >= date_trunc('month', now());
    IF v_count >= p_limit THEN
      RAISE EXCEPTION 'limit_reached' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  INSERT INTO public.opportunity_applications
    (listing_id, applicant_id, owner_id, message, portfolio_url, resume_url, demo_reel_url, availability, expected_rate, custom_answers)
    VALUES (p_listing_id, p_applicant_id, p_owner_id, p_message, p_portfolio_url, p_resume_url, p_demo_reel_url, p_availability, p_expected_rate, coalesce(p_custom_answers, '{}'::jsonb))
    RETURNING * INTO v_row;
  RETURN v_row;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

-- Same pattern for publishing a new Opportunity listing. p_row is the exact
-- listing payload CreateOpportunity.tsx already builds for its direct
-- insert today (id/user_id/created_at/is_active included) --
-- jsonb_populate_record maps it straight onto real listings columns, no
-- need to hand-list ~20 columns here or keep them in sync with the wizard.
CREATE OR REPLACE FUNCTION fn_publish_opportunity(
  p_owner_id uuid, p_limit integer, p_row jsonb
) RETURNS public.listings AS $$
DECLARE
  v_count integer;
  v_row public.listings;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_owner_id::text || to_char(now(), 'YYYY-MM') || ':publish'));
  IF p_limit IS NOT NULL THEN
    SELECT count(*) INTO v_count FROM public.listings
      WHERE user_id = p_owner_id AND listing_type = 'opportunity' AND created_at >= date_trunc('month', now());
    IF v_count >= p_limit THEN
      RAISE EXCEPTION 'limit_reached' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  INSERT INTO public.listings SELECT * FROM jsonb_populate_record(null::public.listings, p_row) RETURNING * INTO v_row;
  RETURN v_row;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

-- Webhook-driven only (single authoritative caller per event, not a
-- user-initiated race) -- plain functions, no advisory lock needed.
-- Never touches creator_plus_verified/is_verified -- verification stays
-- independent of subscription plan.
CREATE OR REPLACE FUNCTION fn_activate_subscription(
  p_user_id uuid, p_plan text, p_customer_id text, p_subscription_id text, p_period_end timestamptz
) RETURNS void AS $$
BEGIN
  UPDATE public.profiles SET
    account_type = p_plan, account_mode = p_plan,
    stripe_customer_id = p_customer_id, stripe_subscription_id = p_subscription_id,
    subscription_status = 'active', subscription_current_period_end = p_period_end,
    subscription_cancel_at_period_end = false
  WHERE id = p_user_id;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

-- Reverts to creator_plus if the user was already verified, else creator.
CREATE OR REPLACE FUNCTION fn_deactivate_subscription(p_user_id uuid) RETURNS void AS $$
BEGIN
  UPDATE public.profiles SET
    account_type = CASE WHEN creator_plus_verified THEN 'creator_plus' ELSE 'creator' END,
    account_mode = CASE WHEN creator_plus_verified THEN 'creator_plus' ELSE 'creator' END,
    subscription_status = 'canceled', subscription_cancel_at_period_end = false
  WHERE id = p_user_id;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;
