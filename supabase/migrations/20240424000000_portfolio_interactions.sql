-- Backs Home -> Portfolio's personalized category chips ("For You").
-- Records a lightweight, weighted interaction log per user -- category is
-- captured at write time (denormalized from whatever the interaction was
-- against) so scoring later is a plain GROUP BY with no joins back to
-- portfolio_items/profiles for content that may since have changed or
-- been deleted.
CREATE TABLE IF NOT EXISTS public.portfolio_interactions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL,
  category    text,                    -- one of PORTFOLIO_CATEGORIES, or null if unknown
  action      text        NOT NULL,    -- 'view' | 'like' | 'unlike' | 'save' | 'unsave' | 'comment' | 'follow_creator' | 'unfollow_creator' | 'share'
  weight      integer     NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS portfolio_interactions_user_idx ON public.portfolio_interactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS portfolio_interactions_category_idx ON public.portfolio_interactions (category);

ALTER TABLE public.portfolio_interactions ENABLE ROW LEVEL SECURITY;

-- Same permissive USING (true) pattern as every other table in this app
-- (auth.uid() is always null here -- see project_auth_model).
CREATE POLICY "portfolio_interactions_all" ON public.portfolio_interactions
  FOR ALL USING (true) WITH CHECK (true);
