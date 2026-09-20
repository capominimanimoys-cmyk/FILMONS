-- FILMONS hashtags -- unifies with the pre-existing hashtags/post_hashtags/
-- search_hashtags/upsert_hashtag scaffolding referenced by
-- CreatePostSheet.tsx and PostComposer.tsx (client code for these already
-- existed before this migration, but no migration anywhere in this repo
-- ever actually created the backing table/RPCs -- likely created directly
-- in Supabase outside version control before this project's "every schema
-- change is a tracked migration" convention took hold).
--
-- REVISED after diagnosing "hashtags result page doesn't show results":
-- querying the live database directly showed this migration was NEVER
-- applied (hashtag_mentions doesn't exist at all), AND the original
-- assumption about the pre-existing `hashtags` table shape was wrong --
-- live columns are (id, tag, uses, created_at), not (id, tag, post_count,
-- created_at, last_used_at). The first version of this migration's
-- CREATE TABLE IF NOT EXISTS would have silently no-op'd against that
-- already-existing table (Postgres doesn't add missing columns from a
-- no-op CREATE), so `post_count` would never have existed -- every RPC
-- and client query built against it would have failed or (worse, for
-- fire-and-forget indexing calls that swallow errors) silently done
-- nothing. This version:
--
--  1. Renames the real `uses` column to `post_count` (single safe rename,
--     zero data loss) so it matches every call site already written
--     against "post_count" -- this migration's own functions below, and
--     hashtagsApi.ts's Hashtag type/getTopHashtags/etc.
--  2. Adds `hashtag_mentions`, a NEW generic mention table so hashtags
--     work across Portfolio items/albums/courses/listings, not just posts
--     (per the FILMONS Browse Search Hashtag Support spec) -- and
--     backfills it from the existing `post_hashtags` rows so posts
--     tagged before this feature existed don't vanish from hashtag
--     results.
--  3. (Re)defines upsert_hashtag/search_hashtags via CREATE OR REPLACE so
--     they work correctly against the renamed column regardless of
--     whatever the original out-of-band versions did.
--
-- IF NOT EXISTS/safe-rename guards + CREATE OR REPLACE throughout so this
-- is safe to run exactly once against the real live schema described
-- above.

CREATE TABLE IF NOT EXISTS public.hashtags (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tag           text        NOT NULL UNIQUE, -- normalized: lowercase, no '#'
  post_count    integer     NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='hashtags' AND column_name='uses')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='hashtags' AND column_name='post_count') THEN
    ALTER TABLE public.hashtags RENAME COLUMN uses TO post_count;
  END IF;
END $$;
ALTER TABLE public.hashtags ADD COLUMN IF NOT EXISTS last_used_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS hashtags_tag_prefix_idx ON public.hashtags (tag text_pattern_ops);

CREATE TABLE IF NOT EXISTS public.post_hashtags (
  post_id     uuid NOT NULL,
  hashtag_id  uuid NOT NULL REFERENCES public.hashtags(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, hashtag_id)
);
CREATE INDEX IF NOT EXISTS post_hashtags_hashtag_idx ON public.post_hashtags (hashtag_id);

-- Generic mention table -- posts included (kept in sync alongside
-- post_hashtags below) plus every other hashtag-bearing content type.
CREATE TABLE IF NOT EXISTS public.hashtag_mentions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  hashtag_id    uuid        NOT NULL REFERENCES public.hashtags(id) ON DELETE CASCADE,
  content_type  text        NOT NULL, -- 'post' | 'portfolio_item' | 'portfolio_album' | 'course'
  content_id    uuid        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hashtag_id, content_type, content_id)
);
CREATE INDEX IF NOT EXISTS hashtag_mentions_hashtag_idx ON public.hashtag_mentions (hashtag_id);
CREATE INDEX IF NOT EXISTS hashtag_mentions_content_idx ON public.hashtag_mentions (content_type, content_id);

-- post_count only ever reflects content_type='post' mentions (that's what
-- the compose-time "#filmmaking · 234 posts" suggestion actually means);
-- last_used_at refreshes on ANY content type's mention. Created BEFORE the
-- backfill below so the backfill's own inserts drive it, rather than
-- needing a separate recompute step.
CREATE OR REPLACE FUNCTION public.fn_sync_hashtag_mention_counts()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.hashtags SET last_used_at = now(),
      post_count = post_count + (CASE WHEN NEW.content_type = 'post' THEN 1 ELSE 0 END)
      WHERE id = NEW.hashtag_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.hashtags SET
      post_count = GREATEST(post_count - (CASE WHEN OLD.content_type = 'post' THEN 1 ELSE 0 END), 0)
      WHERE id = OLD.hashtag_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_hashtag_mention_counts ON public.hashtag_mentions;
CREATE TRIGGER trg_sync_hashtag_mention_counts
AFTER INSERT OR DELETE ON public.hashtag_mentions
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_hashtag_mention_counts();

-- Backfill: every post already tagged via the old post_hashtags-only flow
-- (before hashtagsApi.ts switched to writing hashtag_mentions directly)
-- gets a matching hashtag_mentions row, so it keeps showing up in
-- /hashtag/:tag results instead of silently disappearing. post_count is
-- zeroed first so the trigger above (already live at this point in the
-- script) recomputes it from scratch as these rows are inserted, instead
-- of double-adding on top of whatever the old pre-existing counting
-- mechanism had already set.
UPDATE public.hashtags SET post_count = 0;
INSERT INTO public.hashtag_mentions (hashtag_id, content_type, content_id, created_at)
SELECT ph.hashtag_id, 'post', ph.post_id, ph.created_at
FROM public.post_hashtags ph
ON CONFLICT (hashtag_id, content_type, content_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.upsert_hashtag(p_tag text)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  clean_tag text := lower(regexp_replace(trim(p_tag), '^#', ''));
  result_id uuid;
BEGIN
  IF clean_tag = '' THEN RETURN NULL; END IF;
  INSERT INTO public.hashtags (tag) VALUES (clean_tag)
    ON CONFLICT (tag) DO UPDATE SET tag = EXCLUDED.tag
    RETURNING id INTO result_id;
  RETURN result_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.search_hashtags(p_query text, p_limit integer DEFAULT 20)
RETURNS TABLE(id uuid, tag text, post_count integer) LANGUAGE sql AS $$
  SELECT h.id, h.tag, h.post_count
  FROM public.hashtags h
  WHERE h.tag ILIKE '%' || lower(regexp_replace(trim(p_query), '^#', '')) || '%'
  ORDER BY (h.tag = lower(regexp_replace(trim(p_query), '^#', ''))) DESC, h.post_count DESC
  LIMIT p_limit;
$$;

ALTER TABLE public.hashtags         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_hashtags    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hashtag_mentions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hashtags_all"         ON public.hashtags;
DROP POLICY IF EXISTS "post_hashtags_all"    ON public.post_hashtags;
DROP POLICY IF EXISTS "hashtag_mentions_all" ON public.hashtag_mentions;
CREATE POLICY "hashtags_all"         ON public.hashtags         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "post_hashtags_all"    ON public.post_hashtags    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "hashtag_mentions_all" ON public.hashtag_mentions FOR ALL USING (true) WITH CHECK (true);
