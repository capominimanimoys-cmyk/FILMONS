-- Same bug class as 20240308000000_fix_publish_opportunity_boosted.sql and
-- 20240411000000_fix_publish_opportunity_moderation_status.sql: fn_publish_opportunity
-- inserts via `SELECT * FROM jsonb_populate_record(null::listings, v_row_json)`,
-- which does NOT apply the table's column DEFAULTs for keys missing from the
-- JSON -- every unset column becomes an explicit NULL in the row, bypassing
-- `is_emergency boolean NOT NULL DEFAULT false` (added by
-- 20240401000000_emergency_listings.sql, well before this function last
-- changed, but never added to its jsonb_build_object(...) defaults). The
-- previous fix for `moderation_status` didn't catch this one -- it's a
-- separate column, added by a separate migration. Publishing an opportunity
-- was still failing a not-null violation (now on is_emergency) even after
-- that fix.
--
-- Same fix as both times before: add it to the same defaults line.
CREATE OR REPLACE FUNCTION fn_publish_opportunity(
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

  v_row_json := jsonb_build_object('boosted', false, 'moderation_status', 'active', 'is_emergency', false) || p_row;

  INSERT INTO public.listings SELECT * FROM jsonb_populate_record(null::public.listings, v_row_json) RETURNING * INTO v_row;
  RETURN v_row;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;
