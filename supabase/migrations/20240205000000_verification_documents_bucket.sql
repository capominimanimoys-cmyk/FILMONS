-- Private bucket for Creator+ verification documents (ID photo, proof of
-- address, selfie). `public = false` — objects are never served from a
-- public URL; every read goes through a short-lived signed URL minted at
-- view time (see lib/upload.ts / AdminVerifications.tsx), and the database
-- only ever stores the stable path, not the signed URL itself.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'verification-documents', 'verification-documents', false,
  10 * 1024 * 1024, -- 10 MB, matches the client-side upload limit
  ARRAY['image/jpeg','image/png','image/webp','application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Note on RLS: this app does not put users through Supabase Auth for its
-- normal email/phone sign-in (see AuthContext.tsx) — auth.uid() is null
-- for ordinary sessions, so a policy like
-- `(storage.foldername(name))[1] = auth.uid()::text` would silently block
-- every real user rather than actually restricting access. The admin
-- review panel is also a client-side password gate, not a Supabase Auth
-- role, so it can't be targeted by RLS either. Consistent with every other
-- table/bucket this app's client writes to directly (reviews,
-- notifications, listings images, etc.), access control for this bucket is
-- enforced in application code, not the DB layer. The bucket being
-- private (no public URL) plus paths requiring exact user_id + filename
-- knowledge is the real boundary here — equivalent to the trust level
-- already placed in the anon key everywhere else in this app.
DROP POLICY IF EXISTS "verification_documents_all" ON storage.objects;
CREATE POLICY "verification_documents_all" ON storage.objects
  FOR ALL
  USING (bucket_id = 'verification-documents')
  WITH CHECK (bucket_id = 'verification-documents');
