-- FILMONS Learning -- course views + saves, the two engagement signals
-- (alongside course_enrollments) behind the "Trending topics" ranking
-- (see src/app/lib/topicsApi.ts). Same open RLS model as every other
-- course table (see 20240511000000_courses.sql) -- this app has no
-- Supabase Auth session to scope policies to; writes are made by the
-- client with the anon key.

-- One row per course-detail view. viewer_id is null for signed-out
-- visitors; the client dedupes to one view per course per browser tab
-- session, so a refresh doesn't inflate the count.
CREATE TABLE IF NOT EXISTS public.course_views (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   uuid        NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  viewer_id   uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS course_views_created_idx ON public.course_views (created_at DESC);
CREATE INDEX IF NOT EXISTS course_views_course_idx  ON public.course_views (course_id);

-- A learner's saved ("bookmarked") courses.
CREATE TABLE IF NOT EXISTS public.course_saves (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL,
  course_id   uuid        NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, course_id)
);
CREATE INDEX IF NOT EXISTS course_saves_user_idx    ON public.course_saves (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS course_saves_created_idx ON public.course_saves (created_at DESC);

ALTER TABLE public.course_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_saves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "course_views_all" ON public.course_views;
DROP POLICY IF EXISTS "course_saves_all" ON public.course_saves;
CREATE POLICY "course_views_all" ON public.course_views FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "course_saves_all" ON public.course_saves FOR ALL USING (true) WITH CHECK (true);

-- Enrollments are the third trending signal; index their recency too.
CREATE INDEX IF NOT EXISTS course_enrollments_enrolled_idx ON public.course_enrollments (enrolled_at DESC);
