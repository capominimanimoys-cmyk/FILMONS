-- Real, server-enforced booking-date availability. Replaces the two
-- disconnected, entirely client-side mechanisms that existed before this:
--   1. listings.blocked_dates (host-set, but never actually read by
--      RentRequestModal -- saved and then ignored)
--   2. listings.metadata.unavailableDates (auto-set client-side on accept,
--      by Inbox.tsx's handleAccept, never cleared on cancel/refund, and
--      never checked server-side before a second booking could be accepted)
-- Neither prevented a real double-booking race, and neither is touched by
-- this migration -- `blocked_dates` (host-set) is still read alongside
-- this table wherever availability is checked, both are just no longer
-- the ONLY thing standing between two renters and the same date.
--
-- One row per calendar date a confirmed booking covers (not one row per
-- booking) -- this is what lets "is this exact date available" be a plain
-- indexed lookup instead of a range-overlap scan, and what lets a 3-night
-- booking release exactly the nights it covered on cancellation, not an
-- opaque date range.
CREATE TABLE IF NOT EXISTS public.listing_bookings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id          text NOT NULL,
  order_id            text,
  rental_agreement_id uuid REFERENCES public.rental_agreements(id) ON DELETE SET NULL,
  renter_id           uuid NOT NULL,
  booking_date        date NOT NULL,
  -- Populated only for a listing that captures a specific time slot (this
  -- app's rental flow currently never does -- service bookings are
  -- "N hours starting on a date" with no time-of-day captured anywhere --
  -- so these stay NULL today; a whole-day booking is any row where both
  -- are NULL, and two whole-day rows for the same date always conflict).
  start_time          text,
  end_time            text,
  status              text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  cancelled_at        timestamptz
);
CREATE INDEX IF NOT EXISTS idx_listing_bookings_listing_date ON public.listing_bookings(listing_id, booking_date) WHERE status = 'confirmed';
CREATE INDEX IF NOT EXISTS idx_listing_bookings_order ON public.listing_bookings(order_id);

-- The actual double-booking guard: two CONFIRMED rows can never share a
-- listing+date+slot. Partial (WHERE status='confirmed') so a cancelled
-- booking's old rows don't block the date being claimed again.
CREATE UNIQUE INDEX IF NOT EXISTS idx_listing_bookings_no_double_book
  ON public.listing_bookings(listing_id, booking_date, coalesce(start_time, ''))
  WHERE status = 'confirmed';

ALTER TABLE public.listing_bookings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "listing_bookings_select" ON public.listing_bookings;
-- Read stays open (same app-wide model as everywhere else -- see
-- project_auth_model; the renter-facing calendar needs to know which
-- dates are taken). Write is service-role only (edge functions +
-- SECURITY DEFINER functions below) -- a client can never claim/release a
-- date directly, only through the checked, atomic paths below.
CREATE POLICY "listing_bookings_select" ON public.listing_bookings FOR SELECT USING (true);

-- Atomically checks every date in p_dates against existing CONFIRMED
-- bookings for this listing (same time-slot key), and only inserts if
-- every single one is free -- either the whole booking is claimed or none
-- of it is, never a partial claim. The advisory lock (scoped to the
-- listing, not to any individual date) closes the check-then-insert race
-- two concurrent claims for the same listing could otherwise hit.
CREATE OR REPLACE FUNCTION public.fn_claim_booking_dates(
  p_listing_id text, p_order_id text, p_rental_agreement_id uuid, p_renter_id uuid,
  p_dates date[], p_start_time text DEFAULT NULL, p_end_time text DEFAULT NULL
) RETURNS boolean AS $$
DECLARE
  v_date date;
BEGIN
  IF p_dates IS NULL OR array_length(p_dates, 1) IS NULL THEN RETURN true; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(p_listing_id || ':booking'));

  FOREACH v_date IN ARRAY p_dates LOOP
    IF EXISTS (
      SELECT 1 FROM public.listing_bookings
      WHERE listing_id = p_listing_id AND booking_date = v_date AND status = 'confirmed'
        AND coalesce(start_time, '') = coalesce(p_start_time, '')
    ) THEN
      RETURN false;
    END IF;
  END LOOP;

  INSERT INTO public.listing_bookings (listing_id, order_id, rental_agreement_id, renter_id, booking_date, start_time, end_time)
  SELECT p_listing_id, p_order_id, p_rental_agreement_id, p_renter_id, d, p_start_time, p_end_time
  FROM unnest(p_dates) AS d;

  RETURN true;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cancellation: release every confirmed date tied to an order.
CREATE OR REPLACE FUNCTION public.fn_release_booking_dates(p_order_id text)
RETURNS void AS $$
BEGIN
  UPDATE public.listing_bookings SET status = 'cancelled', cancelled_at = now()
  WHERE order_id = p_order_id AND status = 'confirmed';
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

-- Reschedule: atomically release the order's current dates and claim a new
-- set, as one all-or-nothing operation -- if the new dates aren't fully
-- free, the old ones are left exactly as they were (nothing released,
-- nothing claimed) rather than leaving a booking with no dates at all.
CREATE OR REPLACE FUNCTION public.fn_reschedule_booking_dates(
  p_order_id text, p_listing_id text, p_rental_agreement_id uuid, p_renter_id uuid,
  p_new_dates date[], p_start_time text DEFAULT NULL, p_end_time text DEFAULT NULL
) RETURNS boolean AS $$
DECLARE
  v_date date;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_listing_id || ':booking'));

  IF p_new_dates IS NOT NULL AND array_length(p_new_dates, 1) IS NOT NULL THEN
    FOREACH v_date IN ARRAY p_new_dates LOOP
      IF EXISTS (
        SELECT 1 FROM public.listing_bookings
        WHERE listing_id = p_listing_id AND booking_date = v_date AND status = 'confirmed'
          AND order_id IS DISTINCT FROM p_order_id
          AND coalesce(start_time, '') = coalesce(p_start_time, '')
      ) THEN
        RETURN false;
      END IF;
    END LOOP;
  END IF;

  UPDATE public.listing_bookings SET status = 'cancelled', cancelled_at = now()
  WHERE order_id = p_order_id AND status = 'confirmed';

  IF p_new_dates IS NOT NULL AND array_length(p_new_dates, 1) IS NOT NULL THEN
    INSERT INTO public.listing_bookings (listing_id, order_id, rental_agreement_id, renter_id, booking_date, start_time, end_time)
    SELECT p_listing_id, p_order_id, p_rental_agreement_id, p_renter_id, d, p_start_time, p_end_time
    FROM unnest(p_new_dates) AS d;
  END IF;

  RETURN true;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;
