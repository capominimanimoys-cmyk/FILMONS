-- Filmons uses a custom auth system (not Supabase Auth), so auth.uid() is
-- always null for direct client-side Storage operations.
-- These policies allow the anon role to upload and read from the buckets the
-- app writes to. Application-level auth guards ownership.

-- ── Ensure photo bucket exists (edge function also creates it on first use) ──
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('make-ec8fe879-photos', 'make-ec8fe879-photos', true, 104857600)
ON CONFLICT (id) DO NOTHING;

-- ── make-ec8fe879-photos (avatars, covers, portfolio media) ──────────────────
DROP POLICY IF EXISTS "photos_anon_select" ON storage.objects;
CREATE POLICY "photos_anon_select"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'make-ec8fe879-photos');

DROP POLICY IF EXISTS "photos_anon_insert" ON storage.objects;
CREATE POLICY "photos_anon_insert"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'make-ec8fe879-photos');

DROP POLICY IF EXISTS "photos_anon_update" ON storage.objects;
CREATE POLICY "photos_anon_update"
  ON storage.objects FOR UPDATE
  TO anon, authenticated
  USING (bucket_id = 'make-ec8fe879-photos');

DROP POLICY IF EXISTS "photos_anon_delete" ON storage.objects;
CREATE POLICY "photos_anon_delete"
  ON storage.objects FOR DELETE
  TO anon, authenticated
  USING (bucket_id = 'make-ec8fe879-photos');

-- ── posts bucket (post images, portfolio images/videos) ──────────────────────
DROP POLICY IF EXISTS "posts_storage_anon_select" ON storage.objects;
CREATE POLICY "posts_storage_anon_select"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'posts');

DROP POLICY IF EXISTS "posts_storage_anon_insert" ON storage.objects;
CREATE POLICY "posts_storage_anon_insert"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'posts');

DROP POLICY IF EXISTS "posts_storage_anon_delete" ON storage.objects;
CREATE POLICY "posts_storage_anon_delete"
  ON storage.objects FOR DELETE
  TO anon, authenticated
  USING (bucket_id = 'posts');

-- ── audio bucket (music, sound design, podcasts) ─────────────────────────────
DROP POLICY IF EXISTS "audio_storage_anon_select" ON storage.objects;
CREATE POLICY "audio_storage_anon_select"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'audio');

DROP POLICY IF EXISTS "audio_storage_anon_insert" ON storage.objects;
CREATE POLICY "audio_storage_anon_insert"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'audio');

DROP POLICY IF EXISTS "audio_storage_anon_delete" ON storage.objects;
CREATE POLICY "audio_storage_anon_delete"
  ON storage.objects FOR DELETE
  TO anon, authenticated
  USING (bucket_id = 'audio');
