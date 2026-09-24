-- ─────────────────────────────────────────────────────────────────────────────
-- reposts_count_trigger_reapply.sql — run once in Supabase SQL Editor.
--
-- Evidence: after a real repost (confirmed via the "Reposted" active icon
-- and the "You reposted this post" row, both of which read straight from
-- the `reposts` table -- a real row exists), the post's repost COUNT
-- still shows nothing/0. hasReposted being correct while reposts_count
-- stays wrong means the relationship really is there; only the
-- count-sync trigger from 20240107000000_reposts_count.sql isn't firing
-- -- almost certainly because that migration was never actually applied
-- to this Supabase project (same category of gap as the posts/reposts
-- RLS policies found earlier). This file is byte-for-byte the same
-- CREATE OR REPLACE FUNCTION / DROP+CREATE TRIGGER pattern, safe to
-- re-run regardless of whether it was applied before -- if it already
-- existed, this is a no-op; if it didn't, this installs it.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Column (no-op if it already exists) ────────────────────────────────────
ALTER TABLE posts ADD COLUMN IF NOT EXISTS reposts_count int NOT NULL DEFAULT 0;

-- ── 2. Backfill from the real, already-existing `reposts` rows ────────────────
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
