-- Pass/like history from the Home swipe deck. Log only — nothing reads this
-- to hide passed listings from Marketplace/Search; they remain discoverable
-- there and via direct links.
CREATE TABLE IF NOT EXISTS public.marketplace_swipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  listing_id uuid NOT NULL REFERENCES public.listings(id),
  action text NOT NULL CHECK (action IN ('pass','like')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketplace_swipes_user_listing_idx ON public.marketplace_swipes (user_id, listing_id);

ALTER TABLE public.marketplace_swipes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS marketplace_swipes_all ON public.marketplace_swipes;
CREATE POLICY marketplace_swipes_all ON public.marketplace_swipes FOR ALL USING (true) WITH CHECK (true);
