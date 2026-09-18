-- FILMONS Courses -- a creator-education marketplace connected to Profiles/
-- Connect/Portfolio/Wallet, not a separate product. Any eligible user can
-- browse/purchase; only Professional/Business accounts can create/publish
-- (enforced server-side in coursesApi.ts, not just hidden in the UI).
--
-- This migration lays down the full V1 schema (browse/detail, creation,
-- enrollment, progress, reviews, transactions) even though this pass only
-- ships the read-only browse/detail UI on top of it -- the shape is cheap
-- to agree on now and expensive to bolt on piecemeal later.
--
-- Same permissive USING (true) pattern as every other table in this app
-- (auth.uid() is always null here -- see project_auth_model).

CREATE TABLE IF NOT EXISTS public.courses (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id   uuid        NOT NULL,
  title           text        NOT NULL,
  short_description text,
  description     text,
  category        text,
  subcategory     text,
  level           text        NOT NULL DEFAULT 'all_levels', -- beginner | intermediate | advanced | all_levels
  language        text        NOT NULL DEFAULT 'English',
  location_relevance text,
  learning_outcomes  jsonb     NOT NULL DEFAULT '[]'::jsonb,  -- string[]
  audience        text,       -- "Who is this course for?"
  prerequisites   text,
  cover_url       text,
  trailer_url     text,
  price           numeric(10,2) NOT NULL DEFAULT 0,
  currency        text        NOT NULL DEFAULT 'CAD',
  is_free         boolean     NOT NULL DEFAULT false,
  -- draft: only the instructor can see/edit it. published: publicly
  -- browsable/purchasable. archived: unpublished by the instructor, kept
  -- for existing students but no longer discoverable.
  status          text        NOT NULL DEFAULT 'draft',
  rating_avg      numeric(3,2) NOT NULL DEFAULT 0,
  rating_count    integer     NOT NULL DEFAULT 0,
  student_count   integer     NOT NULL DEFAULT 0,
  published_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS courses_instructor_idx ON public.courses (instructor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS courses_status_category_idx ON public.courses (status, category, created_at DESC);

CREATE TABLE IF NOT EXISTS public.course_sections (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   uuid        NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title       text        NOT NULL,
  position    integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS course_sections_course_idx ON public.course_sections (course_id, position);

CREATE TABLE IF NOT EXISTS public.course_lessons (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id   uuid        NOT NULL REFERENCES public.course_sections(id) ON DELETE CASCADE,
  title        text        NOT NULL,
  type         text        NOT NULL DEFAULT 'video', -- video | text | image | pdf | file | link
  content      text,       -- text/article body, or link URL for 'link' lessons
  video_url    text,
  video_poster_url text,
  video_width  integer,
  video_height integer,
  video_processing_status text DEFAULT 'ready', -- uploading | processing | ready | failed
  duration_seconds integer,
  is_preview   boolean     NOT NULL DEFAULT false, -- "Free Preview" -- viewable without enrolling
  position     integer     NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS course_lessons_section_idx ON public.course_lessons (section_id, position);

CREATE TABLE IF NOT EXISTS public.course_resources (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id   uuid        NOT NULL REFERENCES public.course_lessons(id) ON DELETE CASCADE,
  title       text        NOT NULL,
  file_url    text        NOT NULL,
  file_type   text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS course_resources_lesson_idx ON public.course_resources (lesson_id);

-- One row per (user, course) -- the only real access gate for enrolled
-- content. Created only after payment is confirmed server-side (webhook),
-- never from a client-side "payment succeeded" callback alone.
CREATE TABLE IF NOT EXISTS public.course_enrollments (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL,
  course_id     uuid        NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  payment_id    uuid,       -- references course_transactions(id) once a paid enrollment exists
  status        text        NOT NULL DEFAULT 'active', -- active | refunded
  enrolled_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, course_id)
);
CREATE INDEX IF NOT EXISTS course_enrollments_user_idx ON public.course_enrollments (user_id, enrolled_at DESC);

CREATE TABLE IF NOT EXISTS public.course_progress (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL,
  course_id        uuid        NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  lesson_id        uuid        NOT NULL REFERENCES public.course_lessons(id) ON DELETE CASCADE,
  completed        boolean     NOT NULL DEFAULT false,
  video_position_seconds integer NOT NULL DEFAULT 0,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, lesson_id)
);
CREATE INDEX IF NOT EXISTS course_progress_user_course_idx ON public.course_progress (user_id, course_id);

-- Only enrolled students may review (enforced in coursesApi.ts against
-- course_enrollments) -- deliberately separate from profile
-- recommendations/Reliability, per spec ("a Course review should not
-- automatically count as a Recommendation or Reliability point").
CREATE TABLE IF NOT EXISTS public.course_reviews (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   uuid        NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL,
  rating      integer     NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, user_id)
);
CREATE INDEX IF NOT EXISTS course_reviews_course_idx ON public.course_reviews (course_id, created_at DESC);

-- Its own transaction type (not a rental/service transaction wearing a
-- disguise) -- gross/fee/net kept separately auditable, same as the
-- cash-out/payout ledger. fee_bps is captured PER transaction (not just
-- read from a live config at payout time) so historical course economics
-- stay correct even if the platform fee changes later.
CREATE TABLE IF NOT EXISTS public.course_transactions (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id         uuid        NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  buyer_id          uuid        NOT NULL,
  instructor_id     uuid        NOT NULL,
  gross_amount      numeric(10,2) NOT NULL,
  fee_bps           integer     NOT NULL DEFAULT 800, -- 8.00%, configurable per transaction
  fee_amount        numeric(10,2) NOT NULL,
  net_amount        numeric(10,2) NOT NULL,
  currency          text        NOT NULL DEFAULT 'CAD',
  status            text        NOT NULL DEFAULT 'pending', -- pending | paid | refunded | failed
  payment_provider_ref text,
  payout_status     text        NOT NULL DEFAULT 'unpaid', -- unpaid | paid
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS course_transactions_instructor_idx ON public.course_transactions (instructor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS course_transactions_buyer_idx ON public.course_transactions (buyer_id, created_at DESC);

ALTER TABLE public.courses             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_sections     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_lessons      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_resources    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_enrollments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_progress     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_reviews      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "courses_all"             ON public.courses             FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "course_sections_all"     ON public.course_sections     FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "course_lessons_all"      ON public.course_lessons      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "course_resources_all"    ON public.course_resources    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "course_enrollments_all"  ON public.course_enrollments  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "course_progress_all"     ON public.course_progress     FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "course_reviews_all"      ON public.course_reviews      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "course_transactions_all" ON public.course_transactions FOR ALL USING (true) WITH CHECK (true);
