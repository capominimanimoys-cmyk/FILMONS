-- Structured proposed-rate fields for Opportunity applications. Distinct
-- from the existing free-text `expected_rate` column (a poster-configured
-- optional field, controlled by applicationConfig.requireExpectedRate) --
-- these are specifically for when the LISTING's own compensation is
-- "negotiable" (listings.metadata.opportunity.compensationType), where the
-- applicant must propose a concrete rate for the host to evaluate. Stored
-- on the application, never on the original listing -- the listing's
-- compensation stays "negotiable" regardless of what any one applicant
-- proposes.
ALTER TABLE public.opportunity_applications
  ADD COLUMN IF NOT EXISTS proposed_rate_amount numeric,
  ADD COLUMN IF NOT EXISTS proposed_rate_currency text,
  ADD COLUMN IF NOT EXISTS proposed_rate_type text CHECK (proposed_rate_type IN ('hourly','daily','flat','per_project')),
  ADD COLUMN IF NOT EXISTS proposed_rate_note text;

-- Explicit DROP before CREATE -- adding params is a different argument-type
-- signature as far as Postgres function identity is concerned, so
-- CREATE OR REPLACE alone would leave a second overload sitting alongside
-- the old 12-arg version rather than replacing it (same reasoning as
-- 20240403000000_opportunity_weekly_limits.sql's own DROP before this
-- function's last change).
DROP FUNCTION IF EXISTS fn_submit_opportunity_application(uuid, text, uuid, integer, text, text, text, text, text, text, jsonb, timestamptz);

CREATE FUNCTION fn_submit_opportunity_application(
  p_applicant_id uuid, p_listing_id text, p_owner_id uuid, p_limit integer,
  p_message text, p_portfolio_url text, p_resume_url text, p_demo_reel_url text,
  p_availability text, p_expected_rate text, p_custom_answers jsonb,
  p_proposed_rate_amount numeric, p_proposed_rate_currency text, p_proposed_rate_type text, p_proposed_rate_note text,
  p_window_start timestamptz DEFAULT date_trunc('month', now())
) RETURNS public.opportunity_applications AS $$
DECLARE
  v_count integer;
  v_row public.opportunity_applications;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_applicant_id::text || p_window_start::text || ':apply'));
  IF p_limit IS NOT NULL THEN
    SELECT count(*) INTO v_count FROM public.opportunity_applications
      WHERE applicant_id = p_applicant_id AND created_at >= p_window_start;
    IF v_count >= p_limit THEN
      RAISE EXCEPTION 'limit_reached' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  INSERT INTO public.opportunity_applications
    (listing_id, applicant_id, owner_id, message, portfolio_url, resume_url, demo_reel_url, availability, expected_rate, custom_answers,
     proposed_rate_amount, proposed_rate_currency, proposed_rate_type, proposed_rate_note)
    VALUES (p_listing_id, p_applicant_id, p_owner_id, p_message, p_portfolio_url, p_resume_url, p_demo_reel_url, p_availability, p_expected_rate, coalesce(p_custom_answers, '{}'::jsonb),
     p_proposed_rate_amount, p_proposed_rate_currency, p_proposed_rate_type, p_proposed_rate_note)
    RETURNING * INTO v_row;
  RETURN v_row;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;
