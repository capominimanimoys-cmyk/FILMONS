-- Admin verification review upgrade: internal notes, a richer audit-log
-- action vocabulary, and a view that never ships the full ID number to the
-- browser (only the admin-facing list/detail fetch uses this view; the raw
-- table is still read directly by the service-role-only edge functions).

CREATE TABLE IF NOT EXISTS public.verification_admin_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_id uuid NOT NULL REFERENCES public.identity_verifications(id),
  admin_identifier text NOT NULL,
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS verification_admin_notes_verification_idx ON public.verification_admin_notes (verification_id);
ALTER TABLE public.verification_admin_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS verification_admin_notes_all ON public.verification_admin_notes;
CREATE POLICY verification_admin_notes_all ON public.verification_admin_notes FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.verification_audit_log
  DROP CONSTRAINT IF EXISTS verification_audit_log_action_check;
ALTER TABLE public.verification_audit_log
  ADD CONSTRAINT verification_audit_log_action_check
  CHECK (action IN (
    'viewed_document','approved','changes_requested','denied','documents_deleted',
    'verification_opened','government_id_viewed','proof_of_address_viewed','id_number_revealed'
  ));

-- Admin list/detail view: exposes only the last 4 digits of id_number.
-- The full number is only ever returned by verification-reveal-id, which
-- requires a super_admin token and audit-logs the reveal.
CREATE OR REPLACE VIEW public.identity_verifications_admin_view AS
SELECT
  id, user_id, status,
  legal_first_name, legal_last_name, date_of_birth,
  country_of_residence, address_line1, address_line2, city, province_state, postal_code,
  id_issuing_country, id_type, id_expiry_date,
  right(id_number, 4) AS id_number_last4,
  proof_of_address_type,
  id_front_path, id_back_path, proof_of_address_path, selfie_path,
  decision_reason, reviewed_by, documents_deleted_at,
  submitted_at, reviewed_at, verified_at, created_at, updated_at
FROM public.identity_verifications;
