-- /search and /search/category/* run every typed query through
-- filmSearch.ts's searchMatchingListings/searchMatchingCreators, which
-- match with `ilike '%term%'` (leading wildcard) across listings.title/
-- description/city and profiles.name/username/bio/city, across up to 4
-- expanded terms in parallel (see filmSearch.ts's expandSearchTerms).
--
-- idx_listings_mode_active_created / idx_listings_type_active_created
-- (20240416000000) only help the NO-search-term browse path (equality +
-- ORDER BY) -- a leading-wildcard ilike can never use a plain btree index,
-- so every actual typed search still falls back to a full sequential scan
-- across the whole table, which is the dominant remaining cost once the
-- previously-sequential text/tag queries in filmSearch.ts were parallelized
-- (see that file's history). pg_trgm's GIN trigram indexes are what
-- actually let Postgres use an index for ilike '%term%'.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_listings_title_trgm       ON public.listings USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_listings_description_trgm ON public.listings USING gin (description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_listings_city_trgm        ON public.listings USING gin (city gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_profiles_name_trgm     ON public.profiles USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_profiles_username_trgm ON public.profiles USING gin (username gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_profiles_bio_trgm      ON public.profiles USING gin (bio gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_profiles_city_trgm     ON public.profiles USING gin (city gin_trgm_ops);
