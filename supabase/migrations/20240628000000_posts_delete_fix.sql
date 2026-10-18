-- Deleting a post silently failed or errored for two reasons:
--  1. `posts` had no DELETE policy usable by the app (no real Supabase Auth
--     session, auth.uid() is null), so DELETE matched 0 rows.
--  2. Some tables referencing posts(id) were not ON DELETE CASCADE, so the
--     delete was rejected by a foreign key.
-- Same permissive-RLS convention as reposts_rls_fix.sql: the app scopes
-- deletes to the author (postsApi.delete filters by author_id).

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "posts_delete_open" ON public.posts;
CREATE POLICY "posts_delete_open" ON public.posts FOR DELETE USING (true);
GRANT DELETE ON public.posts TO anon, authenticated;

-- Make every foreign key that points at posts cascade on delete.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conrelid::regclass AS tbl, c.conname, pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    WHERE c.contype = 'f' AND c.confrelid = 'public.posts'::regclass AND c.confdeltype <> 'c'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s ON DELETE CASCADE',
                   r.tbl, r.conname, regexp_replace(r.def, '\s+ON (DELETE|UPDATE) (NO ACTION|RESTRICT|SET NULL|SET DEFAULT)', '', 'g'));
  END LOOP;
END $$;
