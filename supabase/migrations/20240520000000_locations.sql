-- FILMONS Locations -- centralized discovery object, same architecture as
-- hashtags (20240518000000_hashtags.sql): one canonical row per distinct
-- location + a generic mention table, so "Vancouver", "vancouver, bc" and
-- "Vancouver, BC, Canada" all resolve to ONE row instead of three.
--
-- No geocoding/lat-lng here -- this app has no mapping/geocoding provider
-- wired in anywhere, and adding one is its own separate integration. The
-- canonical key is a lightweight normalization of the city segment users
-- already type today (Listing.city, Post/PortfolioItem/PortfolioAlbum's
-- free-text location field): lowercased, trimmed, text before the first
-- comma. Good enough to stop "Vancouver" and "vancouver " from becoming
-- two different discovery objects, which is the actual bug this fixes;
-- true province/country-aware geocoding is future work.

CREATE TABLE IF NOT EXISTS public.locations (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_key text        NOT NULL UNIQUE, -- lowercase city segment, e.g. 'vancouver'
  display_name   text        NOT NULL,        -- first-seen full text, e.g. 'Vancouver, BC, Canada'
  mention_count  integer     NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_used_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS locations_key_prefix_idx ON public.locations (normalized_key text_pattern_ops);

CREATE TABLE IF NOT EXISTS public.location_mentions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id   uuid        NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  content_type  text        NOT NULL, -- 'post' | 'portfolio_item' | 'portfolio_album' | 'listing'
  content_id    uuid        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- Unlike hashtags (many per content), a piece of content has AT MOST ONE
  -- location -- enforced here so indexContentLocation's "set or clear" is a
  -- straightforward delete-then-insert with no risk of ever leaving two.
  UNIQUE (content_type, content_id)
);
CREATE INDEX IF NOT EXISTS location_mentions_location_idx ON public.location_mentions (location_id);
CREATE INDEX IF NOT EXISTS location_mentions_content_idx ON public.location_mentions (content_type, content_id);

CREATE OR REPLACE FUNCTION public.fn_sync_location_mention_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.locations SET mention_count = mention_count + 1, last_used_at = now() WHERE id = NEW.location_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.locations SET mention_count = GREATEST(mention_count - 1, 0) WHERE id = OLD.location_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_location_mention_count ON public.location_mentions;
CREATE TRIGGER trg_sync_location_mention_count
AFTER INSERT OR DELETE ON public.location_mentions
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_location_mention_count();

ALTER TABLE public.locations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_mentions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "locations_all"         ON public.locations;
DROP POLICY IF EXISTS "location_mentions_all" ON public.location_mentions;
CREATE POLICY "locations_all"         ON public.locations         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "location_mentions_all" ON public.location_mentions FOR ALL USING (true) WITH CHECK (true);
