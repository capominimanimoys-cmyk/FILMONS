-- Unfollow has silently never worked: the DELETE policy from
-- 20240120000000_follows_table.sql requires `TO authenticated USING
-- (follower_id = auth.uid())`, but Filmons has no real Supabase Auth
-- sessions -- every request runs as the anon role and auth.uid() is
-- always null (same issue already fixed for INSERT in
-- 20240121000000_follows_rls_fix.sql, but DELETE was never updated to
-- match). Postgres RLS blocking a DELETE returns success with zero rows
-- affected, not an error, so socialApi.unfollow() never threw -- the
-- client's optimistic UI update made it look like it worked while the
-- row stayed in the table forever, and any refetch reverted the "unfollow"
-- back to "following".
DROP POLICY IF EXISTS "follows_delete" ON public.follows;

CREATE POLICY "follows_delete"
  ON public.follows FOR DELETE
  USING (follower_id IS NOT NULL);

GRANT DELETE ON public.follows TO anon, authenticated;
