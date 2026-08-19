-- Lets a host boost their own listing so it sorts above non-boosted
-- listings in Marketplace search (see listingsApi.getAll's ordering).
-- Manual toggle only, no expiry/payment — a host turns it on/off directly
-- from the listing card's owner menu.
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS boosted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS boosted_at timestamptz;
