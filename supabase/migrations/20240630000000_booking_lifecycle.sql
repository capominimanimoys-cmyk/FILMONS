-- Booking lifecycle: return records, work submission, late-fee terms, saved card.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS listing_id               text,
  ADD COLUMN IF NOT EXISTS listing_terms_snapshot   jsonb,        -- exact description / price / cancellation policy / late-fee terms accepted at booking
  ADD COLUMN IF NOT EXISTS late_fee_consent_at      timestamptz,  -- renter agreed to future late-fee charges on the saved card
  ADD COLUMN IF NOT EXISTS stripe_customer_id       text,
  ADD COLUMN IF NOT EXISTS stripe_payment_method_id text,
  ADD COLUMN IF NOT EXISTS returned_at              timestamptz,  -- renter says it was returned (server timestamp)
  ADD COLUMN IF NOT EXISTS returned_note            text,
  ADD COLUMN IF NOT EXISTS returned_evidence        text[],
  ADD COLUMN IF NOT EXISTS return_condition         text,         -- host-recorded condition on return
  ADD COLUMN IF NOT EXISTS work_submitted_at        timestamptz;  -- provider submitted the service work

CREATE INDEX IF NOT EXISTS orders_open_booking_idx ON public.orders (host_id, renter_id) WHERE completed_at IS NULL;
