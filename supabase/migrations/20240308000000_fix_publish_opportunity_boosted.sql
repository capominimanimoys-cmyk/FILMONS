-- Fixes "can't post opportunity" for every account tier (reproduced and
-- confirmed live against a real creator_plus account: fn_publish_opportunity
-- failed with "null value in column \"boosted\" of relation \"listings\"
-- violates not-null constraint").
--
-- Root cause: fn_publish_opportunity inserts via
-- `SELECT * FROM jsonb_populate_record(null::listings, p_row)`.
-- jsonb_populate_record does NOT apply the target table's column DEFAULTs
-- for keys missing from the JSON -- it leaves them as SQL NULL. listings.boosted
-- is NOT NULL (added for Boost V1 this session), and CreateOpportunity.tsx's
-- payload never included it, so every single Opportunity publish attempt
-- has been failing with a 500 since Boost V1 shipped, regardless of tier
-- or monthly usage -- this was never actually a limit/entitlement bug.
--
-- Fix is server-side (not just a client payload patch) so any other
-- caller of this function, present or future, can't hit the same
-- silent-NULL trap for this or an equivalent column.
CREATE OR REPLACE FUNCTION fn_publish_opportunity(
  p_owner_id uuid, p_limit integer, p_row jsonb
) RETURNS public.listings AS $$
DECLARE
  v_count integer;
  v_row public.listings;
  v_row_json jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_owner_id::text || to_char(now(), 'YYYY-MM') || ':publish'));
  IF p_limit IS NOT NULL THEN
    SELECT count(*) INTO v_count FROM public.listings
      WHERE user_id = p_owner_id AND listing_type = 'opportunity' AND created_at >= date_trunc('month', now());
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
