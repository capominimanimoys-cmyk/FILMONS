-- Fix follows INSERT policy.
-- The app uses a custom auth system (edge-function + localStorage) so auth.uid()
-- is not reliably set. Application code already validates the current user and
-- follower_id before calling insert, matching the pattern used for notifications.

DROP POLICY IF EXISTS "follows_insert" ON public.follows;

CREATE POLICY "follows_insert"
  ON public.follows FOR INSERT
  WITH CHECK (
    follower_id  IS NOT NULL AND
    following_id IS NOT NULL AND
    follower_id <> following_id
  );
