-- listings has never had an index supporting its single most common query
-- shape across the whole app (Home's deck, SearchOverlay, CategoryResults,
-- listingsApi.getAll): WHERE is_active = true AND listing_mode/listing_type
-- = ? ORDER BY created_at DESC. Without one, every such query falls back to
-- a sequential scan + sort, getting slower as the table grows -- worst for
-- Rental and Sale specifically since they're the largest categories (most
-- rows to scan), matching the exact "rental and sales listings take time to
-- fetch" symptom reported on /search/category.
--
-- Partial (WHERE is_active = true) since every browse/search query already
-- filters on it and inactive/deleted listings are never shown -- keeps the
-- index smaller and the scan cheaper than an index covering rows nobody
-- queries for this access pattern.
CREATE INDEX IF NOT EXISTS idx_listings_mode_active_created
  ON public.listings (listing_mode, created_at DESC)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_listings_type_active_created
  ON public.listings (listing_type, created_at DESC)
  WHERE is_active = true;
