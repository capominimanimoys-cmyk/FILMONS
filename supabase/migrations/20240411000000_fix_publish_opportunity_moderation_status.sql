-- Fixes opportunity publishing broken by 20240410000000_listing_moderation.sql.
--
-- fn_publish_opportunity builds the new row via
-- `INSERT INTO listings SELECT * FROM jsonb_populate_record(null::listings, v_row_json)`.
-- jsonb_populate_record does NOT apply the target table's column
-- DEFAULTs for keys missing from the JSON (this exact gotcha was hit
-- once before for `boosted`, see 20240308000000_fix_publish_opportunity_boosted.sql)
-- -- it just leaves them NULL, and because the row is inserted via a
-- full `SELECT *` expansion, Postgres sees an explicit NULL for every
-- unset column rather than "value omitted", so the table's own
-- `moderation_status ... NOT NULL DEFAULT 'active'` never kicks in.
-- The client payload (CreateOpportunity.tsx) has no idea this column
-- exists, so every publish was failing a not-null violation.
--
-- Same fix as last time: add it to the same jsonb_build_object(...)
-- defaults line `boosted` already uses, so it's still fully overridable
-- by anything that does start passing it explicitly.
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

  v_row_json := jsonb_build_object('boosted', false, 'moderation_status', 'active') || p_row;

  INSERT INTO public.listings SELECT * FROM jsonb_populate_record(null::public.listings, v_row_json) RETURNING * INTO v_row;
  RETURN v_row;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;
