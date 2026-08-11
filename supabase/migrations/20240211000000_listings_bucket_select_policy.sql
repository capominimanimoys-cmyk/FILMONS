-- 20240208000000_listings_bucket_storage_policy.sql added INSERT/UPDATE/DELETE
-- policies for the `listings` bucket, but missed SELECT — every other bucket
-- in this app (audio, posts, make-ec8fe879-photos) has an explicit
-- anon/authenticated SELECT policy, `listings` never did. Uploads use
-- `upsert: true` (see uploadImage/uploadVideo in src/app/lib/api.ts), which
-- makes Supabase Storage check whether the object already exists before
-- writing it — that existence check is itself subject to RLS, so with no
-- SELECT policy it's implicitly denied, and the write fails with the same
-- generic "new row violates row-level security policy" error as a missing
-- INSERT policy would, even though INSERT was already correctly granted.
DROP POLICY IF EXISTS "listings_storage_anon_select" ON storage.objects;
CREATE POLICY "listings_storage_anon_select" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'listings');
