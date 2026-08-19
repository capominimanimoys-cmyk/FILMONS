-- Lets a Creator+-approved renter reuse their existing identity/address
-- verification instead of re-uploading government ID and proof of address
-- for every rental agreement. Creator+ approval already deletes the raw
-- document files (see verification-decision) — reuse is status + legal
-- info only, never document copying.
ALTER TABLE public.rental_agreements
  ADD COLUMN IF NOT EXISTS renter_verification_id uuid REFERENCES public.identity_verifications(id),
  ADD COLUMN IF NOT EXISTS renter_verification_verified_at timestamptz;
