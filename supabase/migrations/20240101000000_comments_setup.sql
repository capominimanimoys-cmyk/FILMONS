-- ─────────────────────────────────────────────────────────────────────────────
-- comments_setup.sql
-- Run this once in your Supabase SQL editor (Dashboard → SQL Editor → Run)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Ensure comments table has all required columns ────────────────────────
ALTER TABLE comments
  ADD COLUMN IF NOT EXISTS parent_comment_id uuid REFERENCES comments(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS thread_level       int         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS likes_count        int         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS replies_count      int         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_edited          boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_pinned          boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS edited_at          timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at         timestamptz NOT NULL DEFAULT now();

-- Index for fast parent-lookup (replies)
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_comment_id)
  WHERE parent_comment_id IS NOT NULL;

-- Index for fast per-post comment listing
CREATE INDEX IF NOT EXISTS idx_comments_post_created ON comments(post_id, created_at DESC);

-- ── 2. RLS on comments ────────────────────────────────────────────────────────
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- Everyone can read comments (required for the comment count to work)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'comments' AND policyname = 'comments_select_all'
  ) THEN
    CREATE POLICY comments_select_all ON comments FOR SELECT USING (true);
  END IF;
END $$;

-- Authenticated users can insert their own comments
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'comments' AND policyname = 'comments_insert_own'
  ) THEN
    CREATE POLICY comments_insert_own ON comments FOR INSERT TO authenticated
      WITH CHECK (author_id = auth.uid());
  END IF;
END $$;

-- Comment author and post owner can delete
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'comments' AND policyname = 'comments_delete_own'
  ) THEN
    CREATE POLICY comments_delete_own ON comments FOR DELETE TO authenticated
      USING (author_id = auth.uid());
  END IF;
END $$;

-- ── 3. comment_likes table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comment_likes (
  comment_id uuid        NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_comment_likes_comment ON comment_likes(comment_id);

-- ── 4. RLS on comment_likes ───────────────────────────────────────────────────
ALTER TABLE comment_likes ENABLE ROW LEVEL SECURITY;

-- Anyone can read likes (needed to show like counts)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'comment_likes' AND policyname = 'comment_likes_select_all'
  ) THEN
    CREATE POLICY comment_likes_select_all ON comment_likes FOR SELECT USING (true);
  END IF;
END $$;

-- Authenticated users can manage their own likes
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'comment_likes' AND policyname = 'comment_likes_manage_own'
  ) THEN
    CREATE POLICY comment_likes_manage_own ON comment_likes FOR ALL TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- Grant table access to Supabase roles
GRANT SELECT, INSERT, DELETE ON comment_likes TO anon, authenticated;
