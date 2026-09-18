-- Portfolio Albums previously had NO engagement of their own -- Like and
-- Comment buttons existed in the UI but were documented no-ops
-- ("album cards don't carry their own like -- likes are per-item"), always
-- showing 0 and doing nothing when tapped. Per spec: "Portfolio Albums can
-- also be Liked, Commented on... Engagement belongs to the Album itself,
-- not individual preview tiles."

-- ── Likes: a separate table (nothing has a foreign key into
-- portfolio_item_likes, so no conflict extending it, but a clean separate
-- table is simpler than making item_id nullable there). ──────────────────
ALTER TABLE public.portfolio_albums ADD COLUMN IF NOT EXISTS likes_count integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.portfolio_album_likes (
  album_id    uuid NOT NULL REFERENCES public.portfolio_albums(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (album_id, user_id)
);
CREATE INDEX IF NOT EXISTS portfolio_album_likes_album_idx ON public.portfolio_album_likes (album_id);

CREATE OR REPLACE FUNCTION public.fn_sync_portfolio_album_likes_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.portfolio_albums SET likes_count = COALESCE(likes_count, 0) + 1 WHERE id = NEW.album_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.portfolio_albums SET likes_count = GREATEST(COALESCE(likes_count, 0) - 1, 0) WHERE id = OLD.album_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_portfolio_album_likes_count ON public.portfolio_album_likes;
CREATE TRIGGER trg_sync_portfolio_album_likes_count
AFTER INSERT OR DELETE ON public.portfolio_album_likes
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_portfolio_album_likes_count();

ALTER TABLE public.portfolio_album_likes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "portfolio_album_likes_all" ON public.portfolio_album_likes;
CREATE POLICY "portfolio_album_likes_all" ON public.portfolio_album_likes
  FOR ALL USING (true) WITH CHECK (true);

-- ── Comments: reuse portfolio_item_comments (renamed in spirit, not in
-- schema) rather than a second table -- portfolio_comment_likes has a hard
-- foreign key to portfolio_item_comments.id, so a separate
-- portfolio_album_comments table would need its OWN separate likes table
-- too. Extending the existing one keeps comment-likes working identically
-- for both, and CommentRow/toggleCommentLike need zero changes. ─────────
ALTER TABLE public.portfolio_item_comments ALTER COLUMN item_id DROP NOT NULL;
ALTER TABLE public.portfolio_item_comments ADD COLUMN IF NOT EXISTS album_id uuid REFERENCES public.portfolio_albums(id) ON DELETE CASCADE;
ALTER TABLE public.portfolio_item_comments DROP CONSTRAINT IF EXISTS portfolio_item_comments_target_check;
ALTER TABLE public.portfolio_item_comments ADD CONSTRAINT portfolio_item_comments_target_check
  CHECK ((item_id IS NOT NULL) <> (album_id IS NOT NULL));
CREATE INDEX IF NOT EXISTS portfolio_item_comments_album_idx ON public.portfolio_item_comments (album_id);

ALTER TABLE public.portfolio_albums ADD COLUMN IF NOT EXISTS comments_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.fn_sync_portfolio_item_comments_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.item_id IS NOT NULL THEN
      UPDATE public.portfolio_items SET comments_count = comments_count + 1 WHERE id = NEW.item_id;
    ELSE
      UPDATE public.portfolio_albums SET comments_count = comments_count + 1 WHERE id = NEW.album_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.item_id IS NOT NULL THEN
      UPDATE public.portfolio_items SET comments_count = GREATEST(comments_count - 1, 0) WHERE id = OLD.item_id;
    ELSE
      UPDATE public.portfolio_albums SET comments_count = GREATEST(comments_count - 1, 0) WHERE id = OLD.album_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
-- Trigger itself is unchanged (already fires on portfolio_item_comments
-- for both INSERT and DELETE) -- only the function body above changed.
