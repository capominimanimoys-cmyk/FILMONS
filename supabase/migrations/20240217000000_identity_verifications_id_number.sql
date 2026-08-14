-- Adds the raw government ID number to identity_verifications, per explicit
-- product decision — this reverses the original deliberate omission (see
-- 20240204000000_identity_verifications.sql's comment on why it was left
-- out). Admin-only visibility: never exposed to the listing owner, never
-- shown to the renter/other users, only surfaced in the Admin Verifications
-- console for identity review.
ALTER TABLE public.identity_verifications
  ADD COLUMN IF NOT EXISTS id_number text;
