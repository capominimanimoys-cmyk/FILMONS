-- Everything in 20240616000000_search_trigram_indexes.sql PLUS the location columns the place searches use.
-- Safe to run more than once; a missing table/column is skipped, not an error.
-- Search speed: Browse / Search matches with `column ILIKE '%term%'` across
-- several columns (see src/app/lib/filmSearch.ts). A plain b-tree can't serve a
-- leading-wildcard ILIKE, so every keystroke scanned whole tables. Trigram GIN
-- indexes let Postgres answer those lookups from the index. Idempotent and
-- read-only for the app: no queries change, they just get faster.
--
-- pg_trgm lives in the `extensions` schema on Supabase; resolve wherever it is
-- installed so the operator class is found either way.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

DO $$
DECLARE
  ext_schema text;
  spec text[];
  specs text[][] := ARRAY[
    ['listings',         'title'],
    ['listings',         'description'],
    ['listings',         'service_category'],
    ['listings',         'city'],
    ['profiles',         'name'],
    ['profiles',         'username'],
    ['profiles',         'primary_role'],
    ['profiles',         'business_industry'],
    ['profiles',         'bio'],
    ['profiles',         'city'],
    ['portfolio_items',  'title'],
    ['portfolio_items',  'description'],
    ['portfolio_items',  'category'],
    ['portfolio_albums', 'title'],
    ['portfolio_albums', 'description'],
    ['portfolio_albums', 'category'],
    ['posts',            'content'],
    ['profiles',         'location'],
    ['posts',            'location'],
    ['portfolio_items',  'location'],
    ['courses',          'location_relevance'],
    ['courses',          'title']
  ];
BEGIN
  SELECT n.nspname INTO ext_schema
    FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
   WHERE e.extname = 'pg_trgm';
  IF ext_schema IS NULL THEN RETURN; END IF;

  FOREACH spec SLICE 1 IN ARRAY specs LOOP
    BEGIN
      IF to_regclass('public.' || spec[1]) IS NOT NULL THEN
        EXECUTE format(
          'CREATE INDEX IF NOT EXISTS %I ON public.%I USING gin (%I %I.gin_trgm_ops)',
          'idx_trgm_' || spec[1] || '_' || spec[2], spec[1], spec[2], ext_schema);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'skipped trigram index on %.%: %', spec[1], spec[2], SQLERRM;
    END;
  END LOOP;
END $$;
