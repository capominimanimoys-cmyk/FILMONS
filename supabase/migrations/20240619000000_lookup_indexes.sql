-- Plain b-tree indexes for the lookups profiles, search and the place / hashtag pages run constantly
-- (by owner, by recency, by link table). Safe to run more than once: anything that already exists is
-- kept, and a table or column that doesn't exist on your database is skipped, not an error.
DO $$
DECLARE
  spec text[];
  specs text[][] := ARRAY[
    ['posts',               'author_id, created_at desc'],
    ['portfolio_items',     'user_id, created_at desc'],
    ['portfolio_albums',    'user_id, created_at desc'],
    ['portfolio_album_items','album_id'],
    ['listings',            'user_id, created_at desc'],
    ['listings',            'is_active, created_at desc'],
    ['follows',             'following_id'],
    ['follows',             'follower_id'],
    ['notifications',       'user_id, created_at desc'],
    ['hashtag_mentions',    'hashtag_id, created_at desc'],
    ['hashtag_mentions',    'content_type, content_id'],
    ['location_mentions',   'location_id'],
    ['post_locations',      'location_id'],
    ['locations',           'city'],
    ['courses',             'status, created_at desc'],
    ['post_collab_profiles','user_id']
  ];
BEGIN
  FOREACH spec SLICE 1 IN ARRAY specs LOOP
    BEGIN
      IF to_regclass('public.' || spec[1]) IS NOT NULL THEN
        EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (%s)',
          'idx_' || spec[1] || '_' || regexp_replace(spec[2], '[^a-z_]+', '_', 'g'), spec[1], spec[2]);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'skipped index on %(%): %', spec[1], spec[2], SQLERRM;
    END;
  END LOOP;
END $$;

notify pgrst, 'reload schema';
