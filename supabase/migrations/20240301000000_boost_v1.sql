-- Boost Listing V1: fixes two real silent-failure bugs (goal/event-type
-- CHECK constraints missing values the frontend already sends), adds a
-- simplified 3-option audience type, and adds the columns needed for
-- blended (not blunt sort-first) distribution and an admin dashboard.

-- 'more_applications' is already offered by BoostListingFlow.tsx's Goal
-- step for Opportunity listings but was never added to this constraint —
-- every such checkout has been failing at insert time inside boost-charge.
ALTER TABLE public.listing_boosts DROP CONSTRAINT IF EXISTS listing_boosts_goal_check;
ALTER TABLE public.listing_boosts ADD CONSTRAINT listing_boosts_goal_check
  CHECK (goal IN ('more_views','more_messages','more_rental_requests','more_booking_requests','more_applications'));

-- 'application' is already sent by ApplyModal.tsx's boostApi.logEvent call
-- but was never added here either — those inserts have been silently
-- failing (swallowed by logEvent's empty .then(()=>{}, ()=>{})).
-- 'booking_request' is new — service listings' "More Booking Requests"
-- goal had no funnel event of its own to measure against.
ALTER TABLE public.boost_events DROP CONSTRAINT IF EXISTS boost_events_event_type_check;
ALTER TABLE public.boost_events ADD CONSTRAINT boost_events_event_type_check
  CHECK (event_type IN ('impression','view','save','message','rental_request','application','booking_request'));

-- 'canada_us' replaces 'custom' in the UI going forward — 'custom' stays a
-- valid value for any existing rows but the flow never offers it again
-- (spec: no narrow interest-category targeting yet).
ALTER TABLE public.listing_boosts DROP CONSTRAINT IF EXISTS listing_boosts_audience_type_check;
ALTER TABLE public.listing_boosts ADD CONSTRAINT listing_boosts_audience_type_check
  CHECK (audience_type IN ('automatic','local','custom','canada_us'));

-- Delivery/blending — computed once at boost creation from daily_budget,
-- used to weight (never force-rank) boosted listings in getAll(), and to
-- compute the admin "delivery rate" (real impressions ÷ this target).
-- Never shown to the boost owner as a promised number.
ALTER TABLE public.listing_boosts
  ADD COLUMN IF NOT EXISTS delivery_weight numeric,
  ADD COLUMN IF NOT EXISTS impressions_target integer;

-- Admin-configurable knobs the new /admin-boosts config editor writes to.
ALTER TABLE public.boost_config
  ADD COLUMN IF NOT EXISTS priority_multiplier numeric DEFAULT 1,
  ADD COLUMN IF NOT EXISTS min_audience_threshold integer DEFAULT 20,
  ADD COLUMN IF NOT EXISTS frequency_cap_per_user integer DEFAULT 3,
  ADD COLUMN IF NOT EXISTS frequency_cooldown_hours integer DEFAULT 24;
