-- FILMONS Learning -- complete Create course flow: sections with video
-- lessons and quizzes, exercises, preview resources, certificates of
-- completion, draft changes for published courses, and server-side
-- grading/progress.
--
-- Security model (see supabase/functions/server/learning.tsx): the web app
-- talks to Supabase with the anon key, so anything the browser can read,
-- anyone can read. Secret or authoritative data therefore lives where only
-- the server (service role) can reach it:
--   * quiz answer keys, course drafts (contain answer keys), certificates
--     -> RLS on, no policies: no anon/authenticated access at all
--   * lesson media URLs, resources, quiz questions -> served by the
--     server only to enrolled students, the instructor, or (preview
--     lessons only) anyone
--   * progress, quiz attempts, enrollments -> readable, but only the
--     server writes them (grading, 90%-watched rule, free-only enrollment)

-- ── courses ─────────────────────────────────────────────────────────────
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS topics                 text[]      NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS required_tools         text,
  ADD COLUMN IF NOT EXISTS certificate_enabled    boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ownership_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS has_draft_changes      boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS unpublished_at         timestamptz;

-- Statuses are now draft | published | unpublished ("archived" was the old
-- name for unpublished).
UPDATE public.courses SET status = 'unpublished' WHERE status = 'archived';
CREATE INDEX IF NOT EXISTS courses_topics_idx ON public.courses USING gin (topics);

-- ── sections / lessons / resources ──────────────────────────────────────
ALTER TABLE public.course_sections
  ADD COLUMN IF NOT EXISTS description text;

-- type: 'video' | 'quiz' (older lessons may still be text/image/pdf/file/link)
ALTER TABLE public.course_lessons
  ADD COLUMN IF NOT EXISTS description             text,
  ADD COLUMN IF NOT EXISTS exercise_instructions   text,
  ADD COLUMN IF NOT EXISTS exercise_expected_result text,
  ADD COLUMN IF NOT EXISTS quiz_instructions       text,
  ADD COLUMN IF NOT EXISTS quiz_passing_score      integer NOT NULL DEFAULT 70,
  ADD COLUMN IF NOT EXISTS quiz_max_attempts       integer,          -- null = unlimited
  ADD COLUMN IF NOT EXISTS quiz_required           boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_final_quiz           boolean NOT NULL DEFAULT false;

ALTER TABLE public.course_resources
  ADD COLUMN IF NOT EXISTS is_preview boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS position   integer NOT NULL DEFAULT 0;

-- ── quizzes ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.course_quiz_questions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id   uuid        NOT NULL REFERENCES public.course_lessons(id) ON DELETE CASCADE,
  position    integer     NOT NULL DEFAULT 0,
  type        text        NOT NULL DEFAULT 'multiple_choice', -- multiple_choice | true_false
  prompt      text        NOT NULL,
  options     jsonb       NOT NULL DEFAULT '[]'::jsonb,        -- [{ id, text }]
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS course_quiz_questions_lesson_idx ON public.course_quiz_questions (lesson_id, position);

-- Never readable from the browser.
CREATE TABLE IF NOT EXISTS public.course_quiz_answer_keys (
  question_id       uuid PRIMARY KEY REFERENCES public.course_quiz_questions(id) ON DELETE CASCADE,
  correct_option_id text NOT NULL,
  explanation       text
);

CREATE TABLE IF NOT EXISTS public.course_quiz_attempts (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id     uuid        NOT NULL REFERENCES public.course_lessons(id) ON DELETE CASCADE,
  course_id     uuid        NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  user_id       uuid        NOT NULL,
  status        text        NOT NULL DEFAULT 'in_progress', -- in_progress | submitted
  answers       jsonb       NOT NULL DEFAULT '{}'::jsonb,   -- { questionId: optionId }
  score         integer,                                    -- percentage
  passed        boolean,
  started_at    timestamptz NOT NULL DEFAULT now(),
  submitted_at  timestamptz
);
CREATE INDEX IF NOT EXISTS course_quiz_attempts_user_idx ON public.course_quiz_attempts (user_id, lesson_id, started_at DESC);
CREATE INDEX IF NOT EXISTS course_quiz_attempts_course_idx ON public.course_quiz_attempts (course_id);

-- Extra attempts an instructor granted after a student used them all up.
CREATE TABLE IF NOT EXISTS public.course_quiz_attempt_grants (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id   uuid        NOT NULL REFERENCES public.course_lessons(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL,
  granted_by  uuid        NOT NULL,
  attempts    integer     NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS course_quiz_attempt_grants_idx ON public.course_quiz_attempt_grants (lesson_id, user_id);

-- ── progress ────────────────────────────────────────────────────────────
ALTER TABLE public.course_progress
  ADD COLUMN IF NOT EXISTS watched_percent    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS exercise_completed boolean NOT NULL DEFAULT false;

-- ── certificates ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.course_certificates (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code             text        NOT NULL UNIQUE,  -- public certificate ID, e.g. FLM-7Q2K-9XRM
  user_id          uuid        NOT NULL,
  course_id        uuid        NOT NULL REFERENCES public.courses(id) ON DELETE RESTRICT,
  student_name     text        NOT NULL,
  course_title     text        NOT NULL,
  instructor_name  text        NOT NULL,
  completed_at     timestamptz NOT NULL DEFAULT now(),
  issued_at        timestamptz NOT NULL DEFAULT now(),
  revoked          boolean     NOT NULL DEFAULT false,
  UNIQUE (user_id, course_id)                    -- never issued twice
);

-- ── drafts ──────────────────────────────────────────────────────────────
-- The builder's working copy of a whole course (basics, outline, quizzes
-- with answer keys, pricing). Never-published courses publish it for the
-- first time; published ones keep it as "draft changes" until the
-- instructor selects Publish changes.
CREATE TABLE IF NOT EXISTS public.course_drafts (
  course_id   uuid        PRIMARY KEY REFERENCES public.courses(id) ON DELETE CASCADE,
  doc         jsonb       NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ── access rules ────────────────────────────────────────────────────────
ALTER TABLE public.course_quiz_questions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_quiz_answer_keys    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_quiz_attempts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_quiz_attempt_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_certificates        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_drafts              ENABLE ROW LEVEL SECURITY;
-- answer keys, drafts, certificates, questions: no policies = no browser access.

DROP POLICY IF EXISTS "course_quiz_attempts_read" ON public.course_quiz_attempts;
CREATE POLICY "course_quiz_attempts_read" ON public.course_quiz_attempts FOR SELECT USING (true);
DROP POLICY IF EXISTS "course_quiz_attempt_grants_read" ON public.course_quiz_attempt_grants;
CREATE POLICY "course_quiz_attempt_grants_read" ON public.course_quiz_attempt_grants FOR SELECT USING (true);

-- Progress + enrollments: readable, server-written.
DROP POLICY IF EXISTS "course_progress_all" ON public.course_progress;
DROP POLICY IF EXISTS "course_progress_read" ON public.course_progress;
CREATE POLICY "course_progress_read" ON public.course_progress FOR SELECT USING (true);

DROP POLICY IF EXISTS "course_enrollments_all" ON public.course_enrollments;
DROP POLICY IF EXISTS "course_enrollments_read" ON public.course_enrollments;
CREATE POLICY "course_enrollments_read" ON public.course_enrollments FOR SELECT USING (true);

-- Course outline: readable (titles, durations, preview flags), written
-- only by the server's publish step.
DROP POLICY IF EXISTS "course_sections_all" ON public.course_sections;
DROP POLICY IF EXISTS "course_sections_read" ON public.course_sections;
CREATE POLICY "course_sections_read" ON public.course_sections FOR SELECT USING (true);

DROP POLICY IF EXISTS "course_lessons_all" ON public.course_lessons;
DROP POLICY IF EXISTS "course_lessons_read" ON public.course_lessons;
CREATE POLICY "course_lessons_read" ON public.course_lessons FOR SELECT USING (true);

DROP POLICY IF EXISTS "course_resources_all" ON public.course_resources;
-- resources: no policy -> served by the server only.

-- Lesson media URLs and bodies are not readable from the browser at all;
-- the outline columns stay readable.
REVOKE SELECT ON public.course_lessons FROM anon, authenticated;
GRANT SELECT (
  id, section_id, title, type, description, video_poster_url, video_width, video_height,
  video_processing_status, duration_seconds, is_preview, position, created_at,
  quiz_passing_score, quiz_max_attempts, quiz_required, is_final_quiz
) ON public.course_lessons TO anon, authenticated;

-- ── storage: lesson videos, intro videos, resources ─────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('course-media', 'course-media', true, 2147483648)  -- 2 GB per file (the project-wide limit may be lower)
ON CONFLICT (id) DO UPDATE SET file_size_limit = EXCLUDED.file_size_limit;

DROP POLICY IF EXISTS "course_media_bucket_all" ON storage.objects;
CREATE POLICY "course_media_bucket_all" ON storage.objects
  FOR ALL
  USING (bucket_id = 'course-media')
  WITH CHECK (bucket_id = 'course-media');
