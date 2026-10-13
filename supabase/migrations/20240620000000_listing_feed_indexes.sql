-- The marketplace feeds (Home, Browse search, Marketplace, place and hashtag pages) all read
-- "active listings, newest first" and "boosted first". Without a matching index Postgres reads and
-- sorts the whole listings table on every request. Safe to run more than once.
CREATE INDEX IF NOT EXISTS idx_listings_feed
  ON public.listings (is_active, moderation_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_listings_boosted_feed
  ON public.listings (is_active, boosted DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_listings_type_feed
  ON public.listings (listing_type, listing_mode, created_at DESC);
ANALYZE public.listings;
notify pgrst, 'reload schema';
