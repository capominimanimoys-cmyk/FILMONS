-- Portfolio Settings: one row per creator, controlling how their portfolio
-- is displayed/shared/managed. Previously a handful of these (template,
-- show-hire/message/stats) lived in the OWNER's own localStorage but were
-- read unconditionally by every viewer's browser in Portfolio.tsx — i.e. a
-- visitor's own past settings leaked into what they saw on other people's
-- portfolios. Moving this server-side, keyed by user_id, fixes that.
CREATE TABLE IF NOT EXISTS public.portfolio_settings (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,

  visibility                  text NOT NULL DEFAULT 'public'
                                CHECK (visibility IN ('public','followers','private')),
  layout                      text NOT NULL DEFAULT 'grid'
                                CHECK (layout IN ('grid','large_cards','minimal','editorial')),
  sort_order                  text NOT NULL DEFAULT 'newest'
                                CHECK (sort_order IN ('newest','oldest','recently_updated','custom')),

  show_about                  boolean NOT NULL DEFAULT true,
  show_message_button         boolean NOT NULL DEFAULT true,
  show_hire_button            boolean NOT NULL DEFAULT true,
  show_collaboration_button   boolean NOT NULL DEFAULT false,
  show_services               boolean NOT NULL DEFAULT false,
  show_marketplace_listings   boolean NOT NULL DEFAULT false,

  allow_downloads              text NOT NULL DEFAULT 'off'
                                CHECK (allow_downloads IN ('off','individual','selected')),
  allow_likes                  boolean NOT NULL DEFAULT true,
  allow_comments                boolean NOT NULL DEFAULT true,
  show_view_count               boolean NOT NULL DEFAULT true,

  cover_path                   text,
  cover_position_y             numeric NOT NULL DEFAULT 50, -- 0–100, vertical focal point %

  max_featured                 smallint NOT NULL DEFAULT 6
                                CHECK (max_featured BETWEEN 3 AND 6),

  created_at                   timestamptz NOT NULL DEFAULT now(),
  updated_at                   timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.set_portfolio_settings_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_portfolio_settings_updated_at ON public.portfolio_settings;
CREATE TRIGGER trg_portfolio_settings_updated_at
  BEFORE UPDATE ON public.portfolio_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_portfolio_settings_updated_at();

-- Anyone needs to be able to read the owner's visibility/layout/button
-- choices to render their portfolio correctly; only the owner should ever
-- write here (enforced in application code — see project_auth_model note
-- on why real per-row RLS isn't achievable in this app).
ALTER TABLE public.portfolio_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "portfolio_settings_all" ON public.portfolio_settings;
CREATE POLICY "portfolio_settings_all" ON public.portfolio_settings
  FOR ALL USING (true) WITH CHECK (true);

-- Custom drag-and-drop item order and "recently updated" sort both need
-- per-item bookkeeping that didn't exist before.
ALTER TABLE public.portfolio_items ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE public.portfolio_items ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.portfolio_items ADD COLUMN IF NOT EXISTS download_allowed boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.set_portfolio_items_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_portfolio_items_updated_at ON public.portfolio_items;
CREATE TRIGGER trg_portfolio_items_updated_at
  BEFORE UPDATE ON public.portfolio_items
  FOR EACH ROW EXECUTE FUNCTION public.set_portfolio_items_updated_at();

-- ── Engagement: likes, comments, view counts ─────────────────────────────────
-- None of this existed before — views_count/likes_count on portfolio_items were
-- dead columns, never written to. Adding real tables + trigger-synced counters,
-- following the same pattern as fn_sync_post_comment_counts (see
-- 20240104000000_comment_counts_and_mentions.sql).
ALTER TABLE public.portfolio_items ADD COLUMN IF NOT EXISTS comments_count integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.portfolio_item_likes (
  item_id     uuid NOT NULL REFERENCES public.portfolio_items(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, user_id)
);
CREATE INDEX IF NOT EXISTS portfolio_item_likes_item_idx ON public.portfolio_item_likes (item_id);

CREATE TABLE IF NOT EXISTS public.portfolio_item_comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id     uuid NOT NULL REFERENCES public.portfolio_items(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL,
  body        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS portfolio_item_comments_item_idx ON public.portfolio_item_comments (item_id);

CREATE OR REPLACE FUNCTION public.fn_sync_portfolio_item_likes_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.portfolio_items SET likes_count = COALESCE(likes_count, 0) + 1 WHERE id = NEW.item_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.portfolio_items SET likes_count = GREATEST(COALESCE(likes_count, 0) - 1, 0) WHERE id = OLD.item_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_portfolio_item_likes_count ON public.portfolio_item_likes;
CREATE TRIGGER trg_sync_portfolio_item_likes_count
AFTER INSERT OR DELETE ON public.portfolio_item_likes
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_portfolio_item_likes_count();

CREATE OR REPLACE FUNCTION public.fn_sync_portfolio_item_comments_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.portfolio_items SET comments_count = comments_count + 1 WHERE id = NEW.item_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.portfolio_items SET comments_count = GREATEST(comments_count - 1, 0) WHERE id = OLD.item_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_portfolio_item_comments_count ON public.portfolio_item_comments;
CREATE TRIGGER trg_sync_portfolio_item_comments_count
AFTER INSERT OR DELETE ON public.portfolio_item_comments
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_portfolio_item_comments_count();

ALTER TABLE public.portfolio_item_likes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "portfolio_item_likes_all" ON public.portfolio_item_likes;
CREATE POLICY "portfolio_item_likes_all" ON public.portfolio_item_likes
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.portfolio_item_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "portfolio_item_comments_all" ON public.portfolio_item_comments;
CREATE POLICY "portfolio_item_comments_all" ON public.portfolio_item_comments
  FOR ALL USING (true) WITH CHECK (true);

-- Triggers above need to UPDATE portfolio_items regardless of who's "logged in"
-- (no real auth.uid() in this app — see project_auth_model). portfolio_items
-- doesn't have a blanket update policy yet, so add one.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'portfolio_items' AND policyname = 'portfolio_items_update_counts'
  ) THEN
    CREATE POLICY "portfolio_items_update_counts" ON public.portfolio_items FOR UPDATE USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.increment_portfolio_item_views(p_item_id uuid)
RETURNS void LANGUAGE sql AS $$
  UPDATE public.portfolio_items SET views_count = COALESCE(views_count, 0) + 1 WHERE id = p_item_id;
$$;
