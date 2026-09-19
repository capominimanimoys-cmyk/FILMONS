-- FILMONS hashtags -- unifies with the pre-existing hashtags/post_hashtags/
-- search_hashtags/upsert_hashtag scaffolding referenced by
-- CreatePostSheet.tsx and PostComposer.tsx (client code for these already
-- existed before this migration, but no migration anywhere in this repo
-- ever actually created the backing table/RPCs -- likely created directly
-- in Supabase outside version control before this project's "every schema
-- change is a tracked migration" convention took hold). This migration:
--
--  1. Creates `hashtags`/`post_hashtags` if they don't already exist,
--     matching the shape the existing client code already expects
--     (id/tag/post_count -- NOT renamed, to avoid a second, parallel
--     naming scheme).
--  2. Adds `hashtag_mentions`, a NEW generic mention table so hashtags
--     work across Portfolio items/albums and Courses too, not just posts
--     (per the FILMONS Browse Search Hashtag Support spec).
--  3. (Re)defines upsert_hashtag/search_hashtags via CREATE OR REPLACE so
--     they work correctly against this tracked schema regardless of
--     whether a same-named-but-different version already exists live.
--
-- IF NOT EXISTS + CREATE OR REPLACE throughout specifically so this is
-- safe to run whether or not the original out-of-band schema is present.

CREATE TABLE IF NOT EXISTS public.hashtags (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tag           text        NOT NULL UNIQUE, -- normalized: lowercase, no '#'
  post_count    integer     NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);
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
-- last_used_at refreshes on ANY content type's mention.
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
