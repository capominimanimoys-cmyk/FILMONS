-- Real, unbypassable Service-listing posting limit -- Guest/Creator/
-- Creator+ max 1 concurrent active Service listing, Professional/Business
-- unlimited. Mirrors fn_publish_opportunity's shape exactly (see
-- 20240412000000_fix_publish_opportunity_is_emergency.sql) but counts
-- currently-ACTIVE service listings rather than a rolling time window --
-- there's no weekly/monthly reset for Services, it's a permanent
-- concurrent-slot cap (pausing/deleting an existing Service frees a slot
-- immediately, same as Opportunity's own "locked past the limit, not
-- deleted" precedent elsewhere in this app).
--
-- Called only from supabase/functions/publish-service-listing (service-role
-- key, never reachable from the client directly) -- this is what makes the
-- limit real: even a raw direct `insert into listings` from the client
-- can't skip this function, since the client never gets to choose whether
-- to call it.
CREATE OR REPLACE FUNCTION fn_publish_service_listing(
  p_owner_id uuid, p_limit integer, p_row jsonb
) RETURNS public.listings AS $$
DECLARE
  v_count integer;
  v_row public.listings;
  v_row_json jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_owner_id::text || ':publish_service'));
  IF p_limit IS NOT NULL THEN
    SELECT count(*) INTO v_count FROM public.listings
      WHERE user_id = p_owner_id AND listing_type = 'service' AND is_active = true;
    IF v_count >= p_limit THEN
      RAISE EXCEPTION 'limit_reached' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Same jsonb_populate_record gotcha as fn_publish_opportunity: missing
  -- keys become explicit NULL, bypassing the table's own column DEFAULTs.
  v_row_json := jsonb_build_object('boosted', false, 'moderation_status', 'active', 'is_emergency', false) || p_row;

  INSERT INTO public.listings SELECT * FROM jsonb_populate_record(null::public.listings, v_row_json) RETURNING * INTO v_row;
  RETURN v_row;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;
