-- Second pass on identity_verifications, matching the full Creator+
-- verification spec: expanded status lifecycle (pending → under_review →
-- approved/denied, or changes_requested for correctable issues), a
-- decision_reason instead of rejection_reason, a documents_deleted_at
-- marker, and an audit log of admin document access + decisions.
--
-- The table already exists (created empty by 20240204000000), so this is
-- pure ALTER — safe since no rows have ever been submitted against the old
-- shape yet.

ALTER TABLE public.identity_verifications
  DROP CONSTRAINT IF EXISTS identity_verifications_status_check;
ALTER TABLE public.identity_verifications
  ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE public.identity_verifications
  ADD CONSTRAINT identity_verifications_status_check
    CHECK (status IN ('pending','under_review','changes_requested','approved','denied'));

ALTER TABLE public.identity_verifications
  RENAME COLUMN rejection_reason TO decision_reason;
ALTER TABLE public.identity_verifications
  RENAME COLUMN proof_address_path TO proof_of_address_path;

-- Per-document status columns aren't part of the spec's review model
-- (one overall application status covers it) — drop them to avoid a
-- second, unused status surface.
ALTER TABLE public.identity_verifications DROP COLUMN IF EXISTS proof_of_address_status;
ALTER TABLE public.identity_verifications DROP COLUMN IF EXISTS identity_status;
ALTER TABLE public.identity_verifications DROP COLUMN IF EXISTS selfie_status;

ALTER TABLE public.identity_verifications ADD COLUMN IF NOT EXISTS address_line2 text;
ALTER TABLE public.identity_verifications ADD COLUMN IF NOT EXISTS documents_deleted_at timestamptz;

-- Audit trail for admin document access and every approve/changes-requested/
-- deny decision — required so "record admin access and verification
-- decisions in an audit log" is actually satisfied, not just implied by the
-- reviewed_at/reviewed_by columns on the main row.
CREATE TABLE IF NOT EXISTS public.verification_audit_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_id  uuid REFERENCES public.identity_verifications(id) ON DELETE CASCADE,
  user_id          uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  admin_identifier text NOT NULL,
  action           text NOT NULL CHECK (action IN (
                     'viewed_document','approved','changes_requested','denied','documents_deleted'
                   )),
  detail           text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_verification_audit_log_verification_id
  ON public.verification_audit_log(verification_id);

ALTER TABLE public.verification_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "verification_audit_log_all" ON public.verification_audit_log;
CREATE POLICY "verification_audit_log_all" ON public.verification_audit_log
  FOR ALL USING (true) WITH CHECK (true);

-- Public/basic account flag — separate from the general is_verified/
-- account_type fields already used for the blue-check badge elsewhere in
-- the app, so Creator+ status has its own explicit source of truth.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS creator_plus_verified boolean NOT NULL DEFAULT false;
