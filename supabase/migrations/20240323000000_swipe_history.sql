-- Swipe history for the Home discovery deck (SwipeStack.tsx). Previously a
-- left swipe ("pass") had zero persistence -- refreshing the page or
-- switching filters replayed the entire deck from scratch, including
-- cards the user had already dismissed. This table makes a left swipe a
-- real, durable skip, and gives Professional/Business accounts a
-- server-verified Undo (see supabase/functions/undo-swipe) -- tier is
-- looked up fresh from profiles.account_type there, never trusted from
-- the client, same trust model as submit-opportunity-application.
--
-- Modeled directly on boost_events (20240223000000_boost_listings.sql):
-- text item_id (app-generated ids, no FK), a CHECK-constrained enum
-- column, single permissive RLS policy -- Filmons has no real
-- auth.uid()-backed sessions, so ownership is enforced app-side, not by
-- Postgres RLS here.
CREATE TABLE IF NOT EXISTS public.swipes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL,
  item_id    text NOT NULL,
  item_type  text NOT NULL CHECK (item_type IN ('listing','creator')),
  direction  text NOT NULL CHECK (direction IN ('left','right')),
  undone     boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Excluded-ids lookup on load (user_id, direction='left', undone=false).
CREATE INDEX IF NOT EXISTS swipes_user_item_idx ON public.swipes (user_id, item_id);
-- Undo's "most recent swipe" lookup.
CREATE INDEX IF NOT EXISTS swipes_user_created_idx ON public.swipes (user_id, created_at DESC);

ALTER TABLE public.swipes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS swipes_all ON public.swipes;
CREATE POLICY swipes_all ON public.swipes FOR ALL USING (true) WITH CHECK (true);
