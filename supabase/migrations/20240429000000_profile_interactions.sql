-- Backs the Profile page's "Profile Interaction" metric -- broader than
-- portfolio_engagement_events (view/like/comment/share on a specific
-- portfolio ITEM): this covers every OTHER meaningful engagement with a
-- creator across FILMONS -- follow, message, save, View Portfolio click,
-- opening a Service/Listing, saving one, sharing the creator's profile,
-- submitting a recommendation, clicking a social link. Not to be confused
-- with the pre-existing `portfolio_interactions` table (personalization.ts
-- -- category-affinity scoring for Home's "For You" chips, a completely
-- different purpose); this is a new, separately-named table on purpose.
--
-- creator_id is who gets credit; actor_id is who performed it (nullable --
-- a guest can still e.g. open a listing). target_id is optional context
-- (a listing id, a social platform name, etc.) for future per-target
-- breakdowns; the Profile UI itself only ever sums everything into one
-- number (see getProfileInteractionStats, src/app/lib/profileEngagement.ts).
CREATE TABLE IF NOT EXISTS public.profile_engagement_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id  uuid        NOT NULL,
  actor_id    uuid,
  action      text        NOT NULL,   -- 'follow' | 'message' | 'portfolio_save' | 'view_portfolio_click' | 'service_open' | 'listing_open' | 'listing_save' | 'profile_share' | 'recommendation_submitted' | 'social_link_click'
  target_id   text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profile_engagement_events_creator_idx
  ON public.profile_engagement_events (creator_id, action, created_at DESC);

ALTER TABLE public.profile_engagement_events ENABLE ROW LEVEL SECURITY;

-- Same permissive USING (true) pattern as every other table in this app
-- (auth.uid() is always null here -- see project_auth_model).
CREATE POLICY "profile_engagement_events_all" ON public.profile_engagement_events
  FOR ALL USING (true) WITH CHECK (true);

-- Passive profile-page visits -- deliberately NOT counted in the
-- interaction total (per spec: "Do not include passive profile impressions/
-- views"). Tracked separately so a future private Creator Analytics page
-- can show "3.8K Profile views" alongside, without it inflating the public
-- interaction number.
CREATE TABLE IF NOT EXISTS public.profile_views (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id  uuid        NOT NULL,
  viewer_id   uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profile_views_creator_idx ON public.profile_views (creator_id, created_at DESC);

ALTER TABLE public.profile_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profile_views_all" ON public.profile_views
  FOR ALL USING (true) WITH CHECK (true);
