-- Item-level audience + location for portfolio_items -- previously only
-- portfolio_albums and the account-wide portfolio_settings had a
-- visibility concept; individual Portfolio Posts had no per-item audience
-- control at all. Missing/null visibility defaults to 'public' client-side
-- (see portfolioApi.ts), same convention as posts.visibility, so existing
-- rows need no backfill.
ALTER TABLE public.portfolio_items ADD COLUMN IF NOT EXISTS visibility text;
ALTER TABLE public.portfolio_items ADD COLUMN IF NOT EXISTS location   text;
