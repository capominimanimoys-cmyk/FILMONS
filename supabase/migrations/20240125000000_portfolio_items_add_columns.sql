-- Extend portfolio_items with richer metadata and work-type classification.
-- work_type classifies the kind of creative work (photo, video, reel, audio,
-- project, case_study, bts, link) independently of the stored media_type.

ALTER TABLE public.portfolio_items
  ADD COLUMN IF NOT EXISTS work_type    text         NOT NULL DEFAULT 'photo',
  ADD COLUMN IF NOT EXISTS tags         jsonb        DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS tools        jsonb        DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS client_name  text,
  ADD COLUMN IF NOT EXISTS views_count  integer      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saves_count  integer      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS likes_count  integer      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at   timestamptz  DEFAULT now();
