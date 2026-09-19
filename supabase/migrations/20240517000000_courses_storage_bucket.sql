-- Public bucket for course cover images (CreateCourse.tsx) -- covers are
-- meant to be publicly browsable on Learning Home/CourseCard, same as
-- portfolio/listing images, so this is public unlike verification-documents.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'courses', 'courses', true,
  10 * 1024 * 1024,
  ARRAY['image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Same app-code-enforced access pattern as every other bucket in this app
-- (no real Supabase Auth session -- see project_auth_model).
DROP POLICY IF EXISTS "courses_bucket_all" ON storage.objects;
CREATE POLICY "courses_bucket_all" ON storage.objects
  FOR ALL
  USING (bucket_id = 'courses')
  WITH CHECK (bucket_id = 'courses');
