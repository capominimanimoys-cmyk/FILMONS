-- Guest/Creator/Creator+ Opportunity browsing is capped at 5 listings per
-- calendar day, enforced here (not just by hiding extra cards in React) --
-- the same 5 (once allocated) keep showing on every revisit that day
-- instead of a fresh random 5, and a 6th, never-before-seen Opportunity
-- is never allocated once the day's 5 are used, regardless of new search
-- terms, tab switches, or refreshes. Professional/Business are never
-- gated by this table at all (see get-opportunity-feed).
CREATE TABLE IF NOT EXISTS public.opportunity_daily_allowance (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- A real auth user id (as text) for signed-in Creator/Creator+, or a
  -- persisted guest_<uuid> (see src/app/lib/guestIdentity.ts) for guests --
  -- there was no existing server-recognizable guest identifier before this.
  user_key       text NOT NULL,
  allowance_date date NOT NULL,
  listing_id     uuid NOT NULL,
  allocated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_key, allowance_date, listing_id)
);
CREATE INDEX IF NOT EXISTS idx_opp_allowance_lookup ON public.opportunity_daily_allowance (user_key, allowance_date);

ALTER TABLE public.opportunity_daily_allowance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "opportunity_daily_allowance_all" ON public.opportunity_daily_allowance;
CREATE POLICY "opportunity_daily_allowance_all" ON public.opportunity_daily_allowance FOR ALL USING (true) WITH CHECK (true);

-- Returns this user_key's allocated Opportunity listing ids for today,
-- topping up to p_limit (default 5) from active Opportunity listings --
-- newest-first, same ordering SearchOverlay's own category-browse query
-- already uses (fetchCategoryBrowse: is_active = true, created_at desc) --
-- if fewer than p_limit are allocated yet. Never allocates more than
-- p_limit per user_key per day; already-allocated ids are untouched (a
-- revisit never consumes a new slot or reshuffles which 5 are shown).
CREATE OR REPLACE FUNCTION public.fn_get_opportunity_allowance(p_user_key text, p_limit integer DEFAULT 5)
RETURNS TABLE(listing_id uuid) AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'utc')::date;
  v_existing_count integer;
  v_needed integer;
BEGIN
  SELECT count(*) INTO v_existing_count
  FROM public.opportunity_daily_allowance
  WHERE user_key = p_user_key AND allowance_date = v_today;

  v_needed := p_limit - v_existing_count;

  IF v_needed > 0 THEN
    INSERT INTO public.opportunity_daily_allowance (user_key, allowance_date, listing_id)
    SELECT p_user_key, v_today, l.id
    FROM public.listings l
    WHERE l.is_active = true
      AND (
        l.listing_type = 'opportunity'
        OR l.title ILIKE '%model%' OR l.title ILIKE '%actor%' OR l.title ILIKE '%actress%'
        OR l.title ILIKE '%talent%' OR l.title ILIKE '%ugc%'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.opportunity_daily_allowance oda
        WHERE oda.user_key = p_user_key AND oda.allowance_date = v_today AND oda.listing_id = l.id
      )
    ORDER BY l.created_at DESC
    LIMIT v_needed
    ON CONFLICT (user_key, allowance_date, listing_id) DO NOTHING;
  END IF;

  RETURN QUERY
  SELECT oda.listing_id FROM public.opportunity_daily_allowance oda
  WHERE oda.user_key = p_user_key AND oda.allowance_date = v_today
  ORDER BY oda.allocated_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
