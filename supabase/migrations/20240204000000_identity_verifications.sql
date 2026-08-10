-- Dedicated table for Creator+ identity verification data.
--
-- Previously this all lived in verification_requests.metadata as one JSONB
-- blob (and file uploads fell back to base64 in that same blob whenever the
-- verification-documents bucket didn't exist — it never did, so every
-- submission to date has embedded full document bytes in the DB). This
-- replaces that with real columns for KYC metadata and stable storage PATH
-- references for files — never signed URLs (those expire) and never raw
-- bytes. Sensitive identifiers we don't need (full ID number, etc.) are
-- deliberately not collected or stored at all.
--
-- profiles keeps only the public/basic account fields (is_verified,
-- verification_status) — this table holds everything else.

CREATE TABLE IF NOT EXISTS public.identity_verifications (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,

  status                  text NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','approved','rejected','needs_resubmission')),

  -- Personal
  legal_first_name        text,
  legal_last_name         text,
  date_of_birth           date,
  country_of_residence    text,

  -- Location
  address_line1           text,
  address_line2           text,
  city                    text,
  province_state          text,
  postal_code             text,

  -- Identity document — never store the actual ID number, just enough to
  -- know what was checked.
  id_issuing_country      text,
  id_type                 text,
  id_expiry_date          date, -- not yet collected by the client form; reserved

  -- Per-document review state (distinct from the overall `status` above —
  -- lets a reviewer flag e.g. a blurry selfie without failing the ID check).
  proof_of_address_type   text,
  proof_of_address_status text NOT NULL DEFAULT 'pending'
                            CHECK (proof_of_address_status IN ('pending','approved','rejected')),
  identity_status         text NOT NULL DEFAULT 'pending'
                            CHECK (identity_status IN ('pending','approved','rejected')),
  selfie_status           text NOT NULL DEFAULT 'pending'
                            CHECK (selfie_status IN ('pending','approved','rejected')),

  -- Storage paths only (bucket: verification-documents, private) — never
  -- signed URLs or file bytes. id_back_path is reserved; the current form
  -- only collects one ID photo.
  id_front_path           text,
  id_back_path            text,
  proof_address_path      text,
  selfie_path             text,

  rejection_reason        text,
  reviewed_by             text,

  submitted_at            timestamptz,
  reviewed_at             timestamptz,
  verified_at             timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_identity_verifications_status ON public.identity_verifications(status);

-- Keep updated_at current on every write.
CREATE OR REPLACE FUNCTION public.set_identity_verifications_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_identity_verifications_updated_at ON public.identity_verifications;
CREATE TRIGGER trg_identity_verifications_updated_at
  BEFORE UPDATE ON public.identity_verifications
  FOR EACH ROW EXECUTE FUNCTION public.set_identity_verifications_updated_at();

-- RLS: this app authenticates most flows through its own `profiles` table
-- rather than Supabase Auth sessions (see AuthContext.tsx), and the admin
-- review panel is a client-side password gate, not a Supabase Auth role —
-- so per-row RLS can't cleanly distinguish "owner" or "admin" the way it
-- could in an app fully on Supabase Auth. Consistent with every other
-- table this app writes from the client (reviews, notifications, orders,
-- etc.), this stays permissive at the DB layer; access control is enforced
-- in application code the same way it already is everywhere else.
ALTER TABLE public.identity_verifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "identity_verifications_all" ON public.identity_verifications;
CREATE POLICY "identity_verifications_all" ON public.identity_verifications
  FOR ALL USING (true) WITH CHECK (true);
