-- ─────────────────────────────────────────────────────────────────────────────
-- reposts_count.sql  —  run once in Supabase SQL Editor
-- Adds reposts_count to posts and keeps it in sync via trigger.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Column ─────────────────────────────────────────────────────────────────
ALTER TABLE posts ADD COLUMN IF NOT EXISTS reposts_count int NOT NULL DEFAULT 0;

-- ── 2. Backfill existing data ─────────────────────────────────────────────────
UPDATE posts p
SET reposts_count = (SELECT COUNT(*) FROM reposts r WHERE r.post_id = p.id);

-- ── 3. Trigger function ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_sync_reposts_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET reposts_count = reposts_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET reposts_count = GREATEST(reposts_count - 1, 0) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_reposts_count ON reposts;
CREATE TRIGGER trg_sync_reposts_count
AFTER INSERT OR DELETE ON reposts
FOR EACH ROW EXECUTE FUNCTION fn_sync_reposts_count();
