-- filmSearch.ts's searchListingsByTerm/searchProfilesByTerm each run a
-- second query alongside the ilike text-match query, using the `cs`
-- (contains, @>) operator against a jsonb column: listings.tags,
-- profiles.secondary_roles/skills/gear. The 20240419000000 migration added
-- GIN trigram indexes for the ilike text queries, but a trigram index does
-- nothing for a jsonb containment query -- @> needs a GIN index on the
-- jsonb column itself. Without one, EVERY search term still forces a full
-- sequential scan of listings/profiles for this second query, which is why
-- search stayed slow even after the trigram migration: each term's overall
-- latency is bounded by whichever of its two parallel queries is slower,
-- and this one was still doing a full scan.
--
-- Default GIN (jsonb_ops, not jsonb_path_ops) since containment (@>) is
-- exactly what jsonb_ops is built for and it's the safer default if any
-- other jsonb operator is ever added against these columns later.
CREATE INDEX IF NOT EXISTS idx_listings_tags_gin           ON public.listings USING gin (tags);
CREATE INDEX IF NOT EXISTS idx_profiles_secondary_roles_gin ON public.profiles USING gin (secondary_roles);
CREATE INDEX IF NOT EXISTS idx_profiles_skills_gin          ON public.profiles USING gin (skills);
CREATE INDEX IF NOT EXISTS idx_profiles_gear_gin            ON public.profiles USING gin (gear);
