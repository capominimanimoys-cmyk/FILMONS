-- ─────────────────────────────────────────────────────────────────────────────
-- fix_replies_count.sql
-- Run this once in Supabase SQL Editor to fix existing data and add a trigger
-- that keeps replies_count in sync automatically going forward.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Recalculate replies_count for ALL existing top-level comments ──────────
UPDATE comments parent
SET replies_count = (
  SELECT COUNT(*) FROM comments child WHERE child.parent_comment_id = parent.id
);

-- ── 2. Trigger function — keeps replies_count in sync on INSERT / DELETE ──────
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

-- ── 3. Attach the trigger (drop first so re-running the script is safe) ───────
DROP TRIGGER IF EXISTS trg_sync_replies_count ON comments;
CREATE TRIGGER trg_sync_replies_count
AFTER INSERT OR DELETE ON comments
FOR EACH ROW EXECUTE FUNCTION fn_sync_replies_count();
