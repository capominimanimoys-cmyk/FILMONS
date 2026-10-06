-- FILMONS Learning -- live sessions (one-to-one / small group teaching).
-- Instructors publish a session; students contact the instructor or apply;
-- the instructor accepts and confirms date, time and fee; a paid booking is
-- confirmed once the student pays, a free one on acceptance.
--
-- Same open RLS model as every other course table (see
-- 20240511000000_courses.sql: this app has no Supabase Auth session to
-- scope policies to), so "only confirmed participants see the meeting
-- link" is enforced by the client reading live_session_links /
-- live_session_applications.meeting_link only for confirmed bookings.
-- The link is kept out of live_sessions so a plain session listing never
-- carries it.

CREATE TABLE IF NOT EXISTS public.live_sessions (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id    uuid        NOT NULL,
  title            text        NOT NULL,
  cover_url        text,
  description      text,
  topic            text,
  learning_outcomes jsonb      NOT NULL DEFAULT '[]'::jsonb,
  format           text        NOT NULL DEFAULT 'one_to_one',  -- one_to_one | small_group
  duration_minutes integer     NOT NULL DEFAULT 60,
  language         text        NOT NULL DEFAULT 'English',
  max_participants integer     NOT NULL DEFAULT 1,
  timezone         text,
  available_days   jsonb       NOT NULL DEFAULT '[]'::jsonb,   -- ['mon','tue',...]
  allow_preferred_date boolean NOT NULL DEFAULT true,
  is_free          boolean     NOT NULL DEFAULT false,
  price            numeric(10,2) NOT NULL DEFAULT 0,           -- per person, per session
  currency         text        NOT NULL DEFAULT 'CAD',
  platform         text        NOT NULL DEFAULT 'zoom',        -- zoom | teams
  questions        jsonb       NOT NULL DEFAULT '{"goals":true,"experience":true,"dates":true}'::jsonb,
  status           text        NOT NULL DEFAULT 'draft',       -- draft | published | unpublished
  created_at       timestamptz NOT NULL DEFAULT now(),
  published_at     timestamptz
);
CREATE INDEX IF NOT EXISTS live_sessions_instructor_idx ON public.live_sessions (instructor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS live_sessions_published_idx  ON public.live_sessions (status, published_at DESC);

-- Optional default meeting link for the session (instructor-only read).
CREATE TABLE IF NOT EXISTS public.live_session_links (
  session_id   uuid PRIMARY KEY REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  meeting_link text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.live_session_applications (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     uuid        NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  student_id     uuid        NOT NULL,
  goals          text,
  experience     text,
  preferred_date text,
  -- applied -> accepted (instructor set date/time/fee)
  --   -> awaiting_payment (paid) | confirmed (free, or paid)
  -- declined / cancelled end it.
  status         text        NOT NULL DEFAULT 'applied',
  scheduled_at   timestamptz,
  fee            numeric(10,2),
  currency       text,
  meeting_link   text,        -- set at confirmation; visible to the student only once confirmed
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS live_apps_session_idx ON public.live_session_applications (session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS live_apps_student_idx ON public.live_session_applications (student_id, created_at DESC);

ALTER TABLE public.live_sessions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_session_links        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_session_applications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "live_sessions_all"     ON public.live_sessions;
DROP POLICY IF EXISTS "live_session_links_all" ON public.live_session_links;
DROP POLICY IF EXISTS "live_apps_all"         ON public.live_session_applications;
CREATE POLICY "live_sessions_all"      ON public.live_sessions             FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "live_session_links_all" ON public.live_session_links        FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "live_apps_all"          ON public.live_session_applications FOR ALL USING (true) WITH CHECK (true);
