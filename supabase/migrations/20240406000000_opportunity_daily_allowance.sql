-- Guest/Creator/Creator+ can browse ALL Opportunity listings (Home's deck
-- is never filtered down to a fixed subset), but are limited to 5
-- Opportunity SWIPES per calendar day -- separate from, and on top of,
-- the existing general Home swipesPerDay limit (fn_record_swipe/
-- record-swipe). Professional/Business are never gated by this table at
-- all (see get-opportunity-feed / record-opportunity-swipe).
--
-- Revisiting/re-swiping the same listing on the same day never consumes a
-- second slot (UNIQUE(user_key, swipe_date, listing_id) + ON CONFLICT DO
-- NOTHING) -- Home's own swipe-exclusion already keeps a swiped listing
-- out of future deck loads anyway, but this stays correct even if that
-- ever changes.
CREATE TABLE IF NOT EXISTS public.opportunity_swipe_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- A real auth user id (as text) for signed-in Creator/Creator+, or a
  -- persisted guest_<uuid> (see src/app/lib/guestIdentity.ts) for guests --
  -- there was no server-recognizable guest identifier before this.
  user_key    text NOT NULL,
  swipe_date  date NOT NULL,
  listing_id  uuid NOT NULL,
  swiped_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_key, swipe_date, listing_id)
);
CREATE INDEX IF NOT EXISTS idx_opp_swipe_log_lookup ON public.opportunity_swipe_log (user_key, swipe_date);

ALTER TABLE public.opportunity_swipe_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "opportunity_swipe_log_all" ON public.opportunity_swipe_log;
CREATE POLICY "opportunity_swipe_log_all" ON public.opportunity_swipe_log FOR ALL USING (true) WITH CHECK (true);

-- Today's opportunity-swipe count for this user_key -- used to size the
-- deck (remaining = limit - count) before the user swipes at all.
CREATE OR REPLACE FUNCTION public.fn_get_opportunity_swipe_count(p_user_key text)
RETURNS integer AS $$
  SELECT count(*)::integer FROM public.opportunity_swipe_log
  WHERE user_key = p_user_key AND swipe_date = (now() AT TIME ZONE 'utc')::date;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Records one Opportunity swipe, server-enforced against p_limit (default
-- 5) -- the actual boundary, not just a client-side counter. Returns the
-- post-swipe count and whether it was allowed; a listing already logged
-- today for this user_key always succeeds (no-op) regardless of count,
-- matching "don't count a revisit twice."
CREATE OR REPLACE FUNCTION public.fn_record_opportunity_swipe(p_user_key text, p_listing_id uuid, p_limit integer DEFAULT 5)
RETURNS TABLE(swipe_count integer, allowed boolean) AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'utc')::date;
  v_count integer;
  v_already_logged boolean;
BEGIN
  SELECT count(*) INTO v_count FROM public.opportunity_swipe_log
  WHERE user_key = p_user_key AND swipe_date = v_today;

  SELECT EXISTS(
    SELECT 1 FROM public.opportunity_swipe_log
    WHERE user_key = p_user_key AND swipe_date = v_today AND listing_id = p_listing_id
  ) INTO v_already_logged;

  IF NOT v_already_logged AND v_count >= p_limit THEN
    RETURN QUERY SELECT v_count, false;
    RETURN;
  END IF;

  INSERT INTO public.opportunity_swipe_log (user_key, swipe_date, listing_id)
  VALUES (p_user_key, v_today, p_listing_id)
  ON CONFLICT (user_key, swipe_date, listing_id) DO NOTHING;

  SELECT count(*) INTO v_count FROM public.opportunity_swipe_log
  WHERE user_key = p_user_key AND swipe_date = v_today;

  RETURN QUERY SELECT v_count, true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
