-- ─────────────────────────────────────────────────────────────────────────────
-- comment_counts_and_mentions.sql
-- Run once in Supabase SQL Editor. Safe to re-run (IF NOT EXISTS / OR REPLACE).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Add total_comments_count to posts ─────────────────────────────────────
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS total_comments_count int NOT NULL DEFAULT 0;

-- ── 2. Recalculate both count columns from existing data ──────────────────────
UPDATE posts p SET
  comments_count = (
    SELECT COUNT(*) FROM comments c
    WHERE c.post_id = p.id AND c.parent_comment_id IS NULL
  ),
  total_comments_count = (
    SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id
  );

-- ── 3. Trigger: keep both counts in sync on comment INSERT / DELETE ───────────
CREATE OR REPLACE FUNCTION fn_sync_post_comment_counts()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET total_comments_count = total_comments_count + 1 WHERE id = NEW.post_id;
    IF NEW.parent_comment_id IS NULL THEN
      UPDATE posts SET comments_count = comments_count + 1 WHERE id = NEW.post_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET total_comments_count = GREATEST(total_comments_count - 1, 0) WHERE id = OLD.post_id;
    IF OLD.parent_comment_id IS NULL THEN
      UPDATE posts SET comments_count = GREATEST(comments_count - 1, 0) WHERE id = OLD.post_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_post_comment_counts ON comments;
CREATE TRIGGER trg_sync_post_comment_counts
AFTER INSERT OR DELETE ON comments
FOR EACH ROW EXECUTE FUNCTION fn_sync_post_comment_counts();

-- ── 4. comment_mentions table ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comment_mentions (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id        uuid        NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  mentioned_user_id uuid        NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comment_mentions_comment ON comment_mentions(comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_mentions_user   ON comment_mentions(mentioned_user_id);

-- ── 5. RLS on comment_mentions ────────────────────────────────────────────────
ALTER TABLE comment_mentions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='comment_mentions' AND policyname='cm_select_all'
  ) THEN
    CREATE POLICY cm_select_all ON comment_mentions FOR SELECT USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='comment_mentions' AND policyname='cm_insert_auth'
  ) THEN
    CREATE POLICY cm_insert_auth ON comment_mentions FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;

GRANT SELECT, INSERT ON comment_mentions TO anon, authenticated;

-- ── 6. Allow UPDATE on posts so triggers can write counts ─────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='posts' AND policyname='posts_update_counts'
  ) THEN
    CREATE POLICY posts_update_counts ON posts FOR UPDATE USING (true) WITH CHECK (true);
  END IF;
END $$;
