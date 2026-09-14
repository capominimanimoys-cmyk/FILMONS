-- Backs the personalized Portfolio Feed category system.

-- Structured subcategory on top of the existing category column --
-- "Music & Audio -> Hip-Hop & Rap" instead of inferring it from a
-- free-text title. No CHECK constraint (matches the existing category
-- column's own lack of one) since the taxonomy is a client-side constant
-- (PORTFOLIO_SUBCATEGORIES in lib/portfolioApi.ts) that can grow without a
-- migration each time a new subcategory is added.
ALTER TABLE public.portfolio_items
  ADD COLUMN IF NOT EXISTS subcategory text;

CREATE INDEX IF NOT EXISTS portfolio_items_subcategory_idx ON public.portfolio_items (subcategory);

-- Stored, incrementally-updated category/subcategory affinity per user --
-- replaces recomputing a score from the raw portfolio_interactions log on
-- every read. subcategory uses '' (not NULL) for a category-level row:
-- Postgres treats every NULL as distinct for uniqueness purposes, which
-- would let multiple "no subcategory" rows pile up for the same
-- (user_id, category) pair and break the upsert this table is built
-- around -- '' has no such problem and still reads naturally as "no
-- subcategory, this is the category-level row".
CREATE TABLE IF NOT EXISTS public.user_category_affinity (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid        NOT NULL,
  category             text        NOT NULL,
  subcategory          text        NOT NULL DEFAULT '',
  affinity_score       numeric     NOT NULL DEFAULT 0,
  source               text,                    -- last major contributor: 'role' | 'skill' | 'interaction' | 'trending' -- informational only
  interaction_count    integer     NOT NULL DEFAULT 0,
  last_interaction_at  timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, category, subcategory)
);

CREATE INDEX IF NOT EXISTS user_category_affinity_user_idx ON public.user_category_affinity (user_id, affinity_score DESC);

ALTER TABLE public.user_category_affinity ENABLE ROW LEVEL SECURITY;

-- Same permissive USING (true) pattern as every other table in this app
-- (auth.uid() is always null here -- see project_auth_model).
CREATE POLICY "user_category_affinity_all" ON public.user_category_affinity
  FOR ALL USING (true) WITH CHECK (true);
