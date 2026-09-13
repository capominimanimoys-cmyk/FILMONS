-- Backs the new "Hide from Portfolio" action in the Portfolio item's
-- three-dot menu. Standalone portfolio_items previously had no per-item
-- visibility column at all -- only the creator-level portfolio_settings
-- visibility applied to them (see getPortfolioFeed's own comments).
ALTER TABLE public.portfolio_items
  ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS portfolio_items_hidden_idx ON public.portfolio_items (is_hidden);
