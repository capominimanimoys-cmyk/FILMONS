-- Lets a Connect activity event (starting with connection_created, via
-- ConnectionActivityCard) carry real Likes -- per spec, a native Connect
-- activity type should support the same interaction bar as other Connect
-- posts, not a separate system per activity type. Comments are
-- deliberately NOT included here -- a full comment-thread UI generic
-- across every activity type is real, separate scope; this migration only
-- covers Like, which needs just a count + an idempotent per-user toggle
-- table, same shape as post_likes.
ALTER TABLE public.activity_events ADD COLUMN IF NOT EXISTS like_count integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.activity_event_likes (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_event_id uuid        NOT NULL REFERENCES public.activity_events(id) ON DELETE CASCADE,
  user_id           uuid        NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (activity_event_id, user_id)
);
CREATE INDEX IF NOT EXISTS activity_event_likes_event_idx ON public.activity_event_likes (activity_event_id);
CREATE INDEX IF NOT EXISTS activity_event_likes_user_idx  ON public.activity_event_likes (user_id);

ALTER TABLE public.activity_event_likes ENABLE ROW LEVEL SECURITY;
-- Same permissive USING (true) pattern as every other table in this app
-- (auth.uid() is always null here -- see project_auth_model).
CREATE POLICY "activity_event_likes_all" ON public.activity_event_likes
  FOR ALL USING (true) WITH CHECK (true);
