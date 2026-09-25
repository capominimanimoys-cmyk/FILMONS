-- reputation_scores was left with a SELECT-only RLS policy on purpose
-- (see 20240402000000_review_trust_score.sql's own comment: "only the
-- service role (edge functions) and SECURITY DEFINER functions ... can
-- move a score"). In practice, at least one live trigger that recalculates
-- this table (fired from an ordinary client-side write -- e.g. a
-- profiles.account_type change, a review, a connection) is NOT bypassing
-- RLS the way that comment assumed, so any such write from the browser
-- fails outright with "new row violates row-level security policy for
-- table reputation_scores". This app has no real per-row Postgres auth
-- session to scope a narrower policy to (auth.uid() is null for regular
-- users -- see this project's standing RLS note), so, matching how every
-- other actually-working table in this schema is already set up, this
-- opens INSERT/UPDATE the same way SELECT already is.
DROP POLICY IF EXISTS "reputation_scores_write" ON public.reputation_scores;
CREATE POLICY "reputation_scores_write" ON public.reputation_scores
  FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "reputation_scores_update" ON public.reputation_scores;
CREATE POLICY "reputation_scores_update" ON public.reputation_scores
  FOR UPDATE USING (true) WITH CHECK (true);
