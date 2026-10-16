-- Rental agreements must name both parties by the legal name each one gave
-- during identity verification (identity_verifications.legal_first_name /
-- legal_last_name), not their editable public display name.
--
-- The renter's legal name already lives in legal_first_name/legal_last_name.
-- The host had no legal-name columns at all — documents used profiles.name.
-- These columns are written only by the rental-agreement-sign Edge Function,
-- which re-derives both parties' names from identity_verifications at signing
-- time, so they are frozen into the signed agreement.
ALTER TABLE public.rental_agreements
  ADD COLUMN IF NOT EXISTS host_legal_first_name  text,
  ADD COLUMN IF NOT EXISTS host_legal_last_name   text,
  ADD COLUMN IF NOT EXISTS host_verification_id   uuid REFERENCES public.identity_verifications(id),
  -- 'verification' = taken from the party's identity verification record;
  -- 'profile'      = host has never submitted verification, display name used.
  ADD COLUMN IF NOT EXISTS host_name_source       text CHECK (host_name_source IN ('verification','profile'));

-- Extend the signed-agreement immutability backstop to cover every party
-- name, not just the renter's first name.
CREATE OR REPLACE FUNCTION public.prevent_signed_agreement_edit()
RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'signed' AND NEW.status NOT IN ('signed','superseded') THEN
    RAISE EXCEPTION 'Signed rental agreements are immutable (agreement %)', OLD.agreement_number;
  END IF;
  IF OLD.status = 'signed' AND NEW.status = 'signed' THEN
    IF NEW.legal_first_name IS DISTINCT FROM OLD.legal_first_name
      OR NEW.legal_last_name IS DISTINCT FROM OLD.legal_last_name
      OR NEW.host_legal_first_name IS DISTINCT FROM OLD.host_legal_first_name
      OR NEW.host_legal_last_name IS DISTINCT FROM OLD.host_legal_last_name
      OR NEW.rental_rules_snapshot IS DISTINCT FROM OLD.rental_rules_snapshot
      OR NEW.pricing_snapshot IS DISTINCT FROM OLD.pricing_snapshot
      OR NEW.signature_path IS DISTINCT FROM OLD.signature_path THEN
      RAISE EXCEPTION 'Signed rental agreements are immutable (agreement %)', OLD.agreement_number;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
