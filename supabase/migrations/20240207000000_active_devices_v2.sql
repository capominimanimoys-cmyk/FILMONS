-- Extends the existing `active_devices` table (created ad hoc, no prior
-- migration on file — columns confirmed live: id, user_id, session_token,
-- is_active, is_current, device_name, device_type, browser, os,
-- raw_user_agent, city, country, last_active_at, created_at, logged_out_at)
-- to cover the full Active Devices spec: IP address, region, sign-in
-- method, and a distinct revoked_at (a device an admin/another-session
-- signs out is "revoked"; a device that signs itself out is "signed out" —
-- same effect on access, different audit story).
--
-- id/user_id on this table are `text`, not `uuid` (no FK was ever set up),
-- so new tables here follow the same loose-typing convention rather than
-- introducing a type mismatch against it.
ALTER TABLE public.active_devices ADD COLUMN IF NOT EXISTS ip_address text;
ALTER TABLE public.active_devices ADD COLUMN IF NOT EXISTS region text;
ALTER TABLE public.active_devices ADD COLUMN IF NOT EXISTS sign_in_method text;
ALTER TABLE public.active_devices ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

-- "Recent Login Activity" — successful/new-device sign-ins, device
-- sign-outs, and bulk revocations, surfaced in the Active Devices page.
CREATE TABLE IF NOT EXISTS public.security_audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text NOT NULL,
  device_id   text,
  action      text NOT NULL CHECK (action IN (
                'successful_signin','new_device_signin','device_signed_out',
                'all_others_revoked','password_changed','device_removed'
              )),
  detail      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_security_audit_log_user_id ON public.security_audit_log(user_id, created_at DESC);

ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "security_audit_log_all" ON public.security_audit_log;
CREATE POLICY "security_audit_log_all" ON public.security_audit_log
  FOR ALL USING (true) WITH CHECK (true);
-- Same permissive-at-the-DB-layer tradeoff as every other table this app's
-- client writes to directly (see identity_verifications) — this app has no
-- real auth.uid() session for regular users, so owner-only RLS isn't
-- achievable without a broader auth migration. Enforcement here is in
-- application code (devicesApi.ts always scopes queries to the signed-in
-- user's own id).
