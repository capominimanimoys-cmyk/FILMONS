-- ─────────────────────────────────────────────────────────────────────────────
-- reposts_rls_fix.sql — run once in Supabase SQL Editor.
--
-- FILMONS has no real Supabase Auth sessions for regular users (auth.uid()
-- is always null), so any RLS policy on `reposts` that expects a real
-- authenticated session blocks every plain Repost insert -- same root
-- cause already found and fixed for `posts` earlier ("new row violates
-- row level security policy for table posts"). This mirrors that exact
-- fix, plus the same permissive pattern portfolio_reposts already uses
-- (20240522000000_portfolio_reposts.sql).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.reposts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reposts_select_open" ON public.reposts;
CREATE POLICY "reposts_select_open" ON public.reposts
FOR SELECT USING (true);

DROP POLICY IF EXISTS "reposts_insert_open" ON public.reposts;
CREATE POLICY "reposts_insert_open" ON public.reposts
FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "reposts_delete_open" ON public.reposts;
CREATE POLICY "reposts_delete_open" ON public.reposts
FOR DELETE USING (true);

GRANT SELECT, INSERT, DELETE ON public.reposts TO anon, authenticated;
