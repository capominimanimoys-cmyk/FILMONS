-- FILMONS Locations -- generic cross-content-type discovery, same
-- architecture as hashtags (20240518000000_hashtags.sql).
--
-- REVISED after the same diagnosis that caught the hashtags migration
-- never being applied: querying the live DB directly showed `locations`
-- already exists as a REAL, richer, pre-existing table --
-- (id, name, city, province, postal_code, country, lat, lng, uses,
-- created_at), populated by locationApi.ts's Nominatim-backed
-- search/geocode flow (search_post_locations/upsert_location RPCs) and
-- linked to posts via `post_locations(post_id, location_id)`. This
-- migration's first version assumed a much simpler invented schema
-- (normalized_key/display_name/mention_count) that doesn't exist live and
-- was never applied -- same class of bug as hashtags, caught before it
-- shipped broken instead of after a user report this time.
--
-- This version leaves the real `locations`/`post_locations` tables
-- completely untouched (don't fight the existing geocoding system) and
-- only adds what's actually missing: a generic `location_mentions` so
-- Portfolio items/albums/listings can be associated with a location row
-- too, not just posts. Matching against an existing location is done by
-- `city` (case-insensitive) in locationsApi.ts, not a new normalized-key
-- column -- content's free-text location field is "City, Province" (see
-- SmartAddressInput's mode="city"), so `city` is already the right join
-- key and already exists on the real table.
CREATE TABLE IF NOT EXISTS public.location_mentions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id   uuid        NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  content_type  text        NOT NULL, -- 'post' | 'portfolio_item' | 'portfolio_album' | 'listing'
  content_id    uuid        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- A piece of content has AT MOST ONE location -- enforced here so
  -- indexContentLocation's "set or clear" is a straightforward
  -- delete-then-insert with no risk of ever leaving two.
  UNIQUE (content_type, content_id)
);
CREATE INDEX IF NOT EXISTS location_mentions_location_idx ON public.location_mentions (location_id);
CREATE INDEX IF NOT EXISTS location_mentions_content_idx ON public.location_mentions (content_type, content_id);

-- `uses` only ever reflects content_type='post' mentions, matching
-- hashtags.post_count's convention -- created before the backfill below so
-- the backfill's own inserts drive it correctly.
CREATE OR REPLACE FUNCTION public.fn_sync_location_mention_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.locations SET uses = uses + (CASE WHEN NEW.content_type = 'post' THEN 1 ELSE 0 END) WHERE id = NEW.location_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.locations SET uses = GREATEST(uses - (CASE WHEN OLD.content_type = 'post' THEN 1 ELSE 0 END), 0) WHERE id = OLD.location_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_location_mention_count ON public.location_mentions;
CREATE TRIGGER trg_sync_location_mention_count
AFTER INSERT OR DELETE ON public.location_mentions
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_location_mention_count();

-- Backfill: any post already linked via the existing post_locations table
-- (locationApi.ts's attachLocationToPost) gets a matching location_mentions
-- row, so it isn't silently dropped by this generic layer.
INSERT INTO public.location_mentions (location_id, content_type, content_id, created_at)
SELECT pl.location_id, 'post', pl.post_id, now()
FROM public.post_locations pl
ON CONFLICT (content_type, content_id) DO NOTHING;

ALTER TABLE public.location_mentions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "location_mentions_all" ON public.location_mentions;
CREATE POLICY "location_mentions_all" ON public.location_mentions FOR ALL USING (true) WITH CHECK (true);
