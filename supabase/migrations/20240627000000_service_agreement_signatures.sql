-- One row per party who signed the Service Agreement for a hire request.
-- Legal identity is copied from identity verification at signing time and
-- frozen here; signature image lives in the private rental-verification
-- bucket (path only).
CREATE TABLE IF NOT EXISTS public.service_agreement_signatures (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hire_request_id   uuid NOT NULL REFERENCES public.hire_requests(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role              text NOT NULL CHECK (role IN ('client','provider')),
  legal_first_name  text NOT NULL,
  legal_last_name   text NOT NULL,
  date_of_birth     date,
  email             text,
  phone             text,
  verification_id   uuid,
  signature_type    text NOT NULL CHECK (signature_type IN ('drawn','typed')),
  signature_path    text NOT NULL,
  signed_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hire_request_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_service_agreement_signatures_hire ON public.service_agreement_signatures(hire_request_id);

-- Signatures are immutable once written.
CREATE OR REPLACE FUNCTION public.fn_service_signature_immutable() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'service agreement signatures cannot be modified'; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_service_signature_immutable ON public.service_agreement_signatures;
CREATE TRIGGER trg_service_signature_immutable BEFORE UPDATE ON public.service_agreement_signatures
  FOR EACH ROW EXECUTE FUNCTION public.fn_service_signature_immutable();

-- Same permissive-RLS convention as the other client-written tables (app
-- auth is profiles-based, not Supabase Auth).
ALTER TABLE public.service_agreement_signatures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_agreement_signatures_all" ON public.service_agreement_signatures;
CREATE POLICY "service_agreement_signatures_all" ON public.service_agreement_signatures
  FOR ALL USING (true) WITH CHECK (true);
