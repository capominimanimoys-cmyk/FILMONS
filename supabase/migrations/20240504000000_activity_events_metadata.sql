-- Adds a flexible metadata jsonb column to activity_events -- the new
-- richer desktop Connect card designs (Service/Opportunity cards showing
-- price, location, tags) need more cached display data than the original
-- title/category columns carry, and a single jsonb column avoids a sprawl
-- of narrow per-type columns for fields that only ever apply to some
-- activity types. Portfolio-item events deliberately do NOT cache their
-- display data here -- those cards fetch the live PortfolioItem instead
-- (via getPortfolioFeed), since likes/comments/description must stay live,
-- not frozen at publish time.
ALTER TABLE public.activity_events ADD COLUMN IF NOT EXISTS metadata jsonb;
