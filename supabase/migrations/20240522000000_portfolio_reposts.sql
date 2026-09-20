-- Repost for Portfolio Post Cards (PortfolioProjectCard.tsx/
-- PortfolioAlbumCard.tsx), mirroring the existing Post repost system
-- (reposts(user_id, post_id, quote_text) + posts.reposts_count, both
-- updated directly by the client -- no DB trigger -- see PostCard.tsx's
-- handleRepost). Portfolio content isn't a Post row, so it gets its own
-- small table instead of reusing `reposts`, but the same shape/pattern.
CREATE TABLE IF NOT EXISTS public.portfolio_reposts (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL,
  target_type  text        NOT NULL, -- 'portfolio_item' | 'portfolio_album'
  target_id    uuid        NOT NULL,
  quote_text   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, target_type, target_id)
);
CREATE INDEX IF NOT EXISTS portfolio_reposts_target_idx ON public.portfolio_reposts (target_type, target_id);

ALTER TABLE public.portfolio_items  ADD COLUMN IF NOT EXISTS reposts_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.portfolio_albums ADD COLUMN IF NOT EXISTS reposts_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.portfolio_reposts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "portfolio_reposts_all" ON public.portfolio_reposts;
CREATE POLICY "portfolio_reposts_all" ON public.portfolio_reposts FOR ALL USING (true) WITH CHECK (true);
