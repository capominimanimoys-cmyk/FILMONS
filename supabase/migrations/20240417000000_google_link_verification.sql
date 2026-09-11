-- Backs the Google-account-linking email OTP challenge (OAuthCallback.tsx).
-- Separate from device_verification_codes because that flow's success path
-- sets a "trusted device" cookie as a side effect this one doesn't want,
-- and separate from the signup-only client-side OTP in VerifyEmail.tsx
-- (that one has no server persistence and targets an account that doesn't
-- exist yet).
CREATE TABLE IF NOT EXISTS public.google_link_verification_codes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  google_user_id  text NOT NULL,
  code_hash       text NOT NULL,
  attempts        integer NOT NULL DEFAULT 0,
  used_at         timestamptz,
  expires_at      timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_google_link_codes_profile ON public.google_link_verification_codes (profile_id, created_at DESC);

ALTER TABLE public.google_link_verification_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "google_link_verification_codes_service_only" ON public.google_link_verification_codes;
CREATE POLICY "google_link_verification_codes_service_only" ON public.google_link_verification_codes
  FOR ALL USING (false) WITH CHECK (false);
-- Only the service-role key (used exclusively by the google-link-send-code
-- / google-link-verify-code edge functions) can touch this table; it
-- bypasses RLS entirely, so this policy just blocks the anon/authenticated
-- roles from ever reading or writing codes directly.

-- Let the existing security-audit log record a Google-account-linking event.
ALTER TABLE public.security_audit_log DROP CONSTRAINT IF EXISTS security_audit_log_action_check;
ALTER TABLE public.security_audit_log ADD CONSTRAINT security_audit_log_action_check CHECK (action IN (
  'successful_signin','new_device_signin','device_signed_out',
  'all_others_revoked','password_changed','device_removed',
  'google_account_linked'
));
