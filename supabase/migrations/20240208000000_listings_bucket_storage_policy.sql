-- The `listings` storage bucket (public, used for listing photos/videos —
-- see listingsApi.uploadImage/uploadVideo in src/app/lib/api.ts) had NO
-- storage.objects policy of its own. The only pre-existing policy that
-- could apply to any bucket ("Allow authenticated uploads 2iltus_0") is
-- scoped to the `authenticated` Postgres role — but this app's users never
-- get a real Supabase Auth session (see AuthContext.tsx), so every request
-- runs as `anon`. Every upload to this bucket was therefore rejected with
-- "new row violates row-level security policy", which is exactly the error
-- reported when publishing a listing with a photo/video.
--
-- Matches the pattern already used for the `posts`/`audio`/
-- `make-ec8fe879-photos` buckets: anon+authenticated can write, matching
-- this app's actual (anon-key-based) trust model rather than one it
-- doesn't use.
DROP POLICY IF EXISTS "listings_storage_anon_insert" ON storage.objects;
CREATE POLICY "listings_storage_anon_insert" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'listings');

DROP POLICY IF EXISTS "listings_storage_anon_update" ON storage.objects;
CREATE POLICY "listings_storage_anon_update" ON storage.objects
  FOR UPDATE TO anon, authenticated
  USING (bucket_id = 'listings');

DROP POLICY IF EXISTS "listings_storage_anon_delete" ON storage.objects;
CREATE POLICY "listings_storage_anon_delete" ON storage.objects
  FOR DELETE TO anon, authenticated
  USING (bucket_id = 'listings');
