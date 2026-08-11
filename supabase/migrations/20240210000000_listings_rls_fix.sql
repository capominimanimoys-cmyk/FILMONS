-- The `listings` table has RLS enabled (from initial setup) but was never
-- given an app-appropriate policy — its default blocks INSERT/UPDATE/DELETE
-- for anyone. This app has no real Supabase Auth session (auth.uid() is
-- always null — see project_auth_model), so any policy requiring
-- auth.uid() = user_id can never pass. Every other table here (portfolio_items,
-- portfolio_settings, comments, posts, …) already uses a permissive
-- USING (true) WITH CHECK (true) policy and enforces ownership in application
-- code instead; listings never got the same treatment.
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "listings_all" ON public.listings;
CREATE POLICY "listings_all" ON public.listings
  FOR ALL USING (true) WITH CHECK (true);
