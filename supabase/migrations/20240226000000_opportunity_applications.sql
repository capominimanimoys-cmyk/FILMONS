-- Backs the "Apply" flow on Opportunity listings (the repurposed 'talent'
-- listing kind). A real table rather than a repurposed chat message so
-- Admin and Boost Insights can show genuine application counts, and so the
-- long-dormant application_received/accepted/rejected notification types
-- finally have something driving them.
CREATE TABLE IF NOT EXISTS public.opportunity_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.listings(id),
  applicant_id uuid NOT NULL,
  message text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS opportunity_applications_listing_idx ON public.opportunity_applications (listing_id);

ALTER TABLE public.opportunity_applications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS opportunity_applications_all ON public.opportunity_applications;
CREATE POLICY opportunity_applications_all ON public.opportunity_applications FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.listing_boosts DROP CONSTRAINT IF EXISTS listing_boosts_goal_check;
ALTER TABLE public.listing_boosts ADD CONSTRAINT listing_boosts_goal_check
  CHECK (goal IN ('more_views','more_messages','more_rental_requests','more_booking_requests','more_applications'));

ALTER TABLE public.boost_events DROP CONSTRAINT IF EXISTS boost_events_event_type_check;
ALTER TABLE public.boost_events ADD CONSTRAINT boost_events_event_type_check
  CHECK (event_type IN ('impression','view','save','message','rental_request','application'));
