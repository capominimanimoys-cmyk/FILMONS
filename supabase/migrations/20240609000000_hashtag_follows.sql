-- FILMONS Hashtag Page Flow -- "Follow #tag" (per spec: following a
-- hashtag becomes a personalization signal for Home/Connect/Marketplace/
-- Learning recommendations). No existing table covers this; same shape
-- precedent as every other FILMONS follow-style join table.
--
-- No real Supabase Auth sessions exist in this app (auth.uid() is always
-- null for a regular user -- see hashtags_all/post_hashtags_all/
-- hashtag_mentions_all above in 20240518000000_hashtags.sql), so RLS here
-- is permissive the same way, not auth.uid()-gated.
CREATE TABLE IF NOT EXISTS public.hashtag_follows (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL,
  hashtag_id    uuid        NOT NULL REFERENCES public.hashtags(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, hashtag_id)
);
CREATE INDEX IF NOT EXISTS hashtag_follows_user_idx ON public.hashtag_follows (user_id, created_at DESC);

ALTER TABLE public.hashtag_follows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hashtag_follows_all" ON public.hashtag_follows;
CREATE POLICY "hashtag_follows_all" ON public.hashtag_follows FOR ALL USING (true) WITH CHECK (true);
