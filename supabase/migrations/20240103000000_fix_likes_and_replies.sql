-- ─────────────────────────────────────────────────────────────────────────────
-- fix_likes_and_replies.sql
-- Run once in Supabase SQL Editor.  Safe to re-run (IF NOT EXISTS / OR REPLACE).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Allow authenticated users to update comments (needed for likes_count) ──
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'comments' AND policyname = 'comments_update_authenticated'
  ) THEN
    CREATE POLICY comments_update_authenticated ON comments
      FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── 2. Trigger: auto-update comments.likes_count on comment_likes change ──────
CREATE OR REPLACE FUNCTION fn_sync_comment_likes_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE comments SET likes_count = COALESCE(likes_count, 0) + 1 WHERE id = NEW.comment_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE comments SET likes_count = GREATEST(COALESCE(likes_count, 0) - 1, 0) WHERE id = OLD.comment_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_comment_likes_count ON comment_likes;
CREATE TRIGGER trg_sync_comment_likes_count
AFTER INSERT OR DELETE ON comment_likes
FOR EACH ROW EXECUTE FUNCTION fn_sync_comment_likes_count();

-- ── 3. Recalculate likes_count for ALL existing comments from comment_likes ───
UPDATE comments c
SET likes_count = (
  SELECT COUNT(*) FROM comment_likes cl WHERE cl.comment_id = c.id
);

-- ── 4. Trigger: auto-update comments.replies_count on reply insert/delete ─────
CREATE OR REPLACE FUNCTION fn_sync_replies_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.parent_comment_id IS NOT NULL THEN
    UPDATE comments SET replies_count = replies_count + 1 WHERE id = NEW.parent_comment_id;
  ELSIF TG_OP = 'DELETE' AND OLD.parent_comment_id IS NOT NULL THEN
    UPDATE comments SET replies_count = GREATEST(replies_count - 1, 0) WHERE id = OLD.parent_comment_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_replies_count ON comments;
CREATE TRIGGER trg_sync_replies_count
AFTER INSERT OR DELETE ON comments
FOR EACH ROW EXECUTE FUNCTION fn_sync_replies_count();

-- ── 5. Recalculate replies_count for ALL existing top-level comments ──────────
UPDATE comments parent
SET replies_count = (
  SELECT COUNT(*) FROM comments child WHERE child.parent_comment_id = parent.id
);
