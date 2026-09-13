-- Backs the new Portfolio comments bottom sheet's Reply and Like actions --
-- neither existed at the DB level before this (portfolio_item_comments had
-- no parent_id/thread column, and there was no comment-likes table).
ALTER TABLE public.portfolio_item_comments
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.portfolio_item_comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS portfolio_item_comments_parent_idx ON public.portfolio_item_comments (parent_id);

CREATE TABLE IF NOT EXISTS public.portfolio_comment_likes (
  comment_id  uuid        NOT NULL REFERENCES public.portfolio_item_comments(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);
CREATE INDEX IF NOT EXISTS portfolio_comment_likes_comment_idx ON public.portfolio_comment_likes (comment_id);

ALTER TABLE public.portfolio_comment_likes ENABLE ROW LEVEL SECURITY;

-- Same permissive USING (true) pattern as every other table in this app
-- (auth.uid() is always null here -- see project_auth_model).
CREATE POLICY "portfolio_comment_likes_all" ON public.portfolio_comment_likes
  FOR ALL USING (true) WITH CHECK (true);
