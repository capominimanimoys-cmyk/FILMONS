-- Backs the new Profile "Portfolio Interaction" section -- real 30-day vs
-- previous-30-day engagement trends. Nothing before this migration recorded
-- WHEN a view/like/comment/share happened against a specific creator's
-- portfolio item: views_count on portfolio_items is a blind running counter
-- (no per-event timestamp), and shares were never recorded at all (Share
-- buttons only copy a link / open the native share sheet). This is a
-- separate, additive event log -- it doesn't replace those existing
-- counters (still used for the like-heart/views-badge display elsewhere),
-- it just makes a time-windowed, creator-attributed aggregate possible.
--
-- creator_id is denormalized (copied from portfolio_items.user_id at write
-- time) so aggregating "engagement on my portfolio" is a plain GROUP BY
-- with no join back to portfolio_items for content that may since have
-- been deleted -- same reasoning as portfolio_interactions' own category
-- denormalization.
CREATE TABLE IF NOT EXISTS public.portfolio_engagement_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id  uuid        NOT NULL,
  item_id     uuid        NOT NULL,
  viewer_id   uuid,                   -- nullable: anonymous/guest views still count
  action      text        NOT NULL,   -- 'view' | 'like' | 'comment' | 'share'
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS portfolio_engagement_events_creator_idx
  ON public.portfolio_engagement_events (creator_id, action, created_at DESC);

ALTER TABLE public.portfolio_engagement_events ENABLE ROW LEVEL SECURITY;

-- Same permissive USING (true) pattern as every other table in this app
-- (auth.uid() is always null here -- see project_auth_model).
CREATE POLICY "portfolio_engagement_events_all" ON public.portfolio_engagement_events
  FOR ALL USING (true) WITH CHECK (true);
