-- ── portfolio_albums ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.portfolio_albums (
  id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid         NOT NULL,
  title         text         NOT NULL,
  description   text,
  cover_item_id uuid         REFERENCES public.portfolio_items(id) ON DELETE SET NULL,
  visibility    text         NOT NULL DEFAULT 'public',
  sort_order    integer      NOT NULL DEFAULT 0,
  created_at    timestamptz  NOT NULL DEFAULT now(),
  updated_at    timestamptz  DEFAULT now()
);

CREATE INDEX IF NOT EXISTS portfolio_albums_user_idx ON public.portfolio_albums (user_id);

ALTER TABLE public.portfolio_albums ENABLE ROW LEVEL SECURITY;

CREATE POLICY "albums_read"   ON public.portfolio_albums FOR SELECT USING (true);
CREATE POLICY "albums_insert" ON public.portfolio_albums FOR INSERT WITH CHECK (user_id IS NOT NULL);
CREATE POLICY "albums_update" ON public.portfolio_albums FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "albums_delete" ON public.portfolio_albums FOR DELETE USING (true);

-- ── portfolio_album_items ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.portfolio_album_items (
  album_id    uuid  NOT NULL REFERENCES public.portfolio_albums(id) ON DELETE CASCADE,
  item_id     uuid  NOT NULL REFERENCES public.portfolio_items(id)  ON DELETE CASCADE,
  sort_order  integer  NOT NULL DEFAULT 0,
  added_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (album_id, item_id)
);

CREATE INDEX IF NOT EXISTS album_items_album_idx ON public.portfolio_album_items (album_id);
CREATE INDEX IF NOT EXISTS album_items_item_idx  ON public.portfolio_album_items (item_id);

ALTER TABLE public.portfolio_album_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "album_items_read"   ON public.portfolio_album_items FOR SELECT USING (true);
CREATE POLICY "album_items_insert" ON public.portfolio_album_items FOR INSERT WITH CHECK (true);
CREATE POLICY "album_items_delete" ON public.portfolio_album_items FOR DELETE USING (true);

-- ── Dimension columns on portfolio_items ─────────────────────────────────────
-- Stores the original image dimensions so masonry can use true aspect ratios.
ALTER TABLE public.portfolio_items
  ADD COLUMN IF NOT EXISTS aspect_ratio        numeric,
  ADD COLUMN IF NOT EXISTS width               integer,
  ADD COLUMN IF NOT EXISTS height              integer,
  ADD COLUMN IF NOT EXISTS media_url_original  text;
