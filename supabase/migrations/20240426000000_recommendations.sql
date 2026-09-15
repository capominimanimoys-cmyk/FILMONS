-- Backs the new Profile "Recommendations" section -- a professional
-- endorsement written by one creator about another (distinct from a
-- transactional Review, which is tied to a listing/booking). Nothing like
-- this existed before this migration.
--
-- One active recommendation per (recommender, recipient) pair -- writing
-- again is an upsert (edit your own recommendation), not a second row.
-- role_snapshot captures the recommender's primary_role AT THE TIME they
-- wrote it, so it reads correctly even if they change roles later.
CREATE TABLE IF NOT EXISTS public.recommendations (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  recommender_id uuid        NOT NULL,
  recipient_id   uuid        NOT NULL,
  role_snapshot  text,
  relationship   text,
  body           text        NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recommender_id, recipient_id)
);

CREATE INDEX IF NOT EXISTS recommendations_recipient_idx ON public.recommendations (recipient_id, created_at DESC);

ALTER TABLE public.recommendations ENABLE ROW LEVEL SECURITY;

-- Same permissive USING (true) pattern as every other table in this app
-- (auth.uid() is always null here -- see project_auth_model).
CREATE POLICY "recommendations_all" ON public.recommendations
  FOR ALL USING (true) WITH CHECK (true);
