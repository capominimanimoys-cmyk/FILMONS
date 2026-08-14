-- Redesigns the Rental Agreement system.
--
-- The previous `rental_agreements` table (like `orders`/`receipts`) was
-- never created by a tracked migration — it only exists live in Supabase,
-- shaped by whatever RentalAgreementModal.tsx happened to insert
-- (first_name/last_name/id_number/id_photo_url holding a *signed URL*
-- rather than a path, etc.). Rather than `CREATE TABLE IF NOT EXISTS`
-- (which would silently no-op against that old live table and leave the
-- new columns missing), the old table is renamed out of the way so its
-- history is preserved but inert, and a proper table is created fresh —
-- same move already used for fp_wallets in 20240212000000.
--
-- Schema follows the identity_verifications pattern exactly: storage
-- PATHS only (never signed URLs, which expire — see the old idUrl/proofUrl
-- bug this replaces), no raw government ID number, a status lifecycle, and
-- an audit log. Snapshot columns (rental_rules_snapshot,
-- rental_details_snapshot, pricing_snapshot) freeze what the renter agreed
-- to at signing time so later edits to the listing/order can never alter
-- an already-signed agreement.
ALTER TABLE IF EXISTS public.rental_agreements RENAME TO deprecated_rental_agreements_v1;

CREATE TABLE public.rental_agreements (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_number         text NOT NULL UNIQUE,

  order_id                 text,
  listing_id               text,
  conversation_id          text,
  message_id               text,

  renter_id                uuid NOT NULL,
  host_id                  uuid,

  status                   text NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft','awaiting_verification','ready_to_sign','signed','cancelled','superseded')),

  -- Personal (renter-entered)
  legal_first_name         text,
  legal_last_name          text,
  date_of_birth            date,

  -- Verified contact — copied from profiles at signing time, never
  -- accepted as free text from the client.
  verified_email           text,
  verified_phone           text,

  -- Address
  address_country          text,
  address_line1            text,
  address_line2            text,
  city                     text,
  province_state           text,
  postal_code              text,

  -- Identity document — no raw ID number, matching identity_verifications.
  id_issuing_country       text,
  id_type                  text,
  id_front_path            text,
  id_back_path             text,
  id_verification_status   text NOT NULL DEFAULT 'pending'
                              CHECK (id_verification_status IN ('pending','provided','verified','rejected')),

  -- Proof of address
  proof_of_address_type    text,
  proof_of_address_path    text,
  address_verification_status text NOT NULL DEFAULT 'pending'
                              CHECK (address_verification_status IN ('pending','provided','verified','rejected')),

  -- Frozen at signing — later listing/order edits must never change these.
  rental_rules_snapshot    jsonb,
  rental_details_snapshot  jsonb,
  pricing_snapshot         jsonb,
  agreement_terms_version  text,

  -- Signature
  signature_type           text CHECK (signature_type IN ('drawn','typed')),
  signature_path            text,

  -- Generated documents (private bucket, paths only)
  agreement_renter_path     text,
  agreement_host_path       text,
  receipt_path               text,

  signed_at                 timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rental_agreements_renter ON public.rental_agreements(renter_id);
CREATE INDEX IF NOT EXISTS idx_rental_agreements_host   ON public.rental_agreements(host_id);
CREATE INDEX IF NOT EXISTS idx_rental_agreements_order  ON public.rental_agreements(order_id);
CREATE INDEX IF NOT EXISTS idx_rental_agreements_status ON public.rental_agreements(status);

CREATE OR REPLACE FUNCTION public.set_rental_agreements_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_rental_agreements_updated_at ON public.rental_agreements;
CREATE TRIGGER trg_rental_agreements_updated_at
  BEFORE UPDATE ON public.rental_agreements
  FOR EACH ROW EXECUTE FUNCTION public.set_rental_agreements_updated_at();

-- Immutability at the DB layer: once a row is signed, no further UPDATE may
-- change any column except superseding it (status -> 'superseded' when a
-- replacement agreement is created for a materially changed order). This is
-- a backstop — the Edge Function is the only intended writer of
-- status='signed' in the first place.
CREATE OR REPLACE FUNCTION public.prevent_signed_agreement_edit()
RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'signed' AND NEW.status NOT IN ('signed','superseded') THEN
    RAISE EXCEPTION 'Signed rental agreements are immutable (agreement %)', OLD.agreement_number;
  END IF;
  IF OLD.status = 'signed' AND NEW.status = 'signed' THEN
    -- Allow only status/updated_at to move once already signed.
    IF NEW.legal_first_name IS DISTINCT FROM OLD.legal_first_name
      OR NEW.rental_rules_snapshot IS DISTINCT FROM OLD.rental_rules_snapshot
      OR NEW.pricing_snapshot IS DISTINCT FROM OLD.pricing_snapshot
      OR NEW.signature_path IS DISTINCT FROM OLD.signature_path THEN
      RAISE EXCEPTION 'Signed rental agreements are immutable (agreement %)', OLD.agreement_number;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_signed_agreement_edit ON public.rental_agreements;
CREATE TRIGGER trg_prevent_signed_agreement_edit
  BEFORE UPDATE ON public.rental_agreements
  FOR EACH ROW EXECUTE FUNCTION public.prevent_signed_agreement_edit();

CREATE TABLE IF NOT EXISTS public.rental_agreement_audit_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id uuid NOT NULL REFERENCES public.rental_agreements(id) ON DELETE CASCADE,
  action       text NOT NULL CHECK (action IN ('created','draft_updated','document_uploaded','viewed_document','signed','cancelled','superseded')),
  actor_id     text,
  actor_role   text CHECK (actor_role IN ('renter','host','admin','system')),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rental_agreement_audit_agreement ON public.rental_agreement_audit_log(agreement_id);

-- RLS: same app-enforced trust model as every other table here (no real
-- Supabase Auth session — see project_auth_model).
ALTER TABLE public.rental_agreements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rental_agreements_all" ON public.rental_agreements;
CREATE POLICY "rental_agreements_all" ON public.rental_agreements FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.rental_agreement_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rental_agreement_audit_log_all" ON public.rental_agreement_audit_log;
CREATE POLICY "rental_agreement_audit_log_all" ON public.rental_agreement_audit_log FOR ALL USING (true) WITH CHECK (true);

-- `orders` also only exists live (untracked) — additive-only columns so
-- nothing existing breaks. Kept separate from the rename-and-recreate above
-- since orders holds live transactional data that must not be touched.
ALTER TABLE IF EXISTS public.orders
  ADD COLUMN IF NOT EXISTS rental_agreement_id uuid REFERENCES public.rental_agreements(id);

-- Private bucket for rental verification documents (ID front/back, proof of
-- address, signature) and the generated agreement/receipt documents.
-- `public = false` — every read goes through a short-lived signed URL
-- minted at view time (see src/lib/upload.ts), never a permanent URL.
-- Replaces the previous flow, which uploaded to a public 'documents'
-- bucket (or 'agreements' with a 60-day signed URL baked directly into the
-- DB row and emailed out — a link that silently breaks after 60 days).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'rental-verification', 'rental-verification', false,
  15 * 1024 * 1024,
  ARRAY['image/jpeg','image/png','image/webp','application/pdf','text/html']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "rental_verification_all" ON storage.objects;
CREATE POLICY "rental_verification_all" ON storage.objects
  FOR ALL
  USING (bucket_id = 'rental-verification')
  WITH CHECK (bucket_id = 'rental-verification');
