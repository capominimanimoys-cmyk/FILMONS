-- Creator/Professional Opportunity posting + application limits move from
-- a fixed calendar-month window to a weekly one (Creator+/Business stay
-- monthly -- see supabase/functions/_shared/entitlements.ts's `window`
-- field). Both fn_publish_opportunity and fn_submit_opportunity_application
-- previously hardcoded `date_trunc('month', now())` with no tier-awareness
-- at all -- the window boundary is now passed in as `p_window_start`,
-- computed per-tier by the calling edge function (see
-- _shared/limitWindow.ts), so this function stays window-unit-agnostic
-- rather than needing to know which tiers are weekly vs monthly itself.
--
-- The advisory lock key also moves from a 'YYYY-MM' string to
-- p_window_start's own timestamp -- that keeps concurrent-request
-- serialization correctly scoped to whatever window is actually in effect
-- (weekly or monthly) instead of only ever matching on the calendar month.
--
-- Explicit DROP before CREATE: adding a trailing parameter is a different
-- argument-type signature as far as Postgres function identity is
-- concerned, so CREATE OR REPLACE alone would create a second overload
-- sitting alongside the old 3-arg/11-arg versions rather than actually
-- replacing them -- any caller still using the old argument count would
-- keep hitting the old, unfixed function.
DROP FUNCTION IF EXISTS fn_publish_opportunity(uuid, integer, jsonb);
DROP FUNCTION IF EXISTS fn_submit_opportunity_application(uuid, text, uuid, integer, text, text, text, text, text, text, jsonb);

CREATE FUNCTION fn_publish_opportunity(
  p_owner_id uuid, p_limit integer, p_row jsonb, p_window_start timestamptz DEFAULT date_trunc('month', now())
) RETURNS public.listings AS $$
DECLARE
  v_count integer;
  v_row public.listings;
  v_row_json jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_owner_id::text || p_window_start::text || ':publish'));
  IF p_limit IS NOT NULL THEN
    SELECT count(*) INTO v_count FROM public.listings
      WHERE user_id = p_owner_id AND listing_type = 'opportunity' AND created_at >= p_window_start;
    IF v_count >= p_limit THEN
      RAISE EXCEPTION 'limit_reached' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Defaults applied only when the caller didn't already supply the key --
  -- jsonb's `||` right-hand side wins, so p_row's own value always takes
  -- precedence over this fallback.
  v_row_json := jsonb_build_object('boosted', false) || p_row;

  INSERT INTO public.listings SELECT * FROM jsonb_populate_record(null::public.listings, v_row_json) RETURNING * INTO v_row;
  RETURN v_row;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE FUNCTION fn_submit_opportunity_application(
  p_applicant_id uuid, p_listing_id text, p_owner_id uuid, p_limit integer,
  p_message text, p_portfolio_url text, p_resume_url text, p_demo_reel_url text,
  p_availability text, p_expected_rate text, p_custom_answers jsonb,
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
    (listing_id, applicant_id, owner_id, message, portfolio_url, resume_url, demo_reel_url, availability, expected_rate, custom_answers)
    VALUES (p_listing_id, p_applicant_id, p_owner_id, p_message, p_portfolio_url, p_resume_url, p_demo_reel_url, p_availability, p_expected_rate, coalesce(p_custom_answers, '{}'::jsonb))
    RETURNING * INTO v_row;
  RETURN v_row;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;
