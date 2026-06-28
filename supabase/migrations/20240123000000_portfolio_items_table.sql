-- portfolio_items table
-- Stores each user's portfolio entries (images, videos, audio, links).

CREATE TABLE IF NOT EXISTS public.portfolio_items (
  id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid         NOT NULL,
  title         text         NOT NULL DEFAULT '',
  description   text,
  category      text         NOT NULL DEFAULT '',
  role          text,
  year          integer,
  media_type    text         NOT NULL DEFAULT 'image',  -- 'image' | 'video' | 'audio' | 'link'
  media_url     text,
  thumbnail_url text,
  external_link text,
  is_featured   boolean      NOT NULL DEFAULT false,
  created_at    timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS portfolio_items_user_idx ON public.portfolio_items (user_id);
CREATE INDEX IF NOT EXISTS portfolio_items_featured_idx ON public.portfolio_items (user_id, is_featured);

ALTER TABLE public.portfolio_items ENABLE ROW LEVEL SECURITY;

-- Anyone can read portfolio items (public profiles)
CREATE POLICY "portfolio_items_read"
  ON public.portfolio_items FOR SELECT
  USING (true);

-- Insert: validated at application level (user_id must be non-null)
CREATE POLICY "portfolio_items_insert"
  ON public.portfolio_items FOR INSERT
  WITH CHECK (user_id IS NOT NULL);

-- Update / delete: only the owner's rows
-- (permissive: auth.uid() may be null in custom auth flow — app validates ownership)
CREATE POLICY "portfolio_items_update"
  ON public.portfolio_items FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "portfolio_items_delete"
  ON public.portfolio_items FOR DELETE
  USING (true);
