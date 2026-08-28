-- Guest Contact Support: a support_cases row previously always required a
-- real profiles.id (user_id NOT NULL, FK to profiles). A guest submitting
-- a request has no profile at all, so user_id must become nullable, with
-- guest_name/guest_email carrying the contact info a profile would
-- otherwise have supplied -- these are only ever set together with
-- user_id IS NULL (an authenticated case still looks up name/email from
-- profiles via user_id, unchanged).
ALTER TABLE public.support_cases ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.support_cases ADD COLUMN IF NOT EXISTS guest_name text;
ALTER TABLE public.support_cases ADD COLUMN IF NOT EXISTS guest_email text;

-- IP-keyed rate-limit log for the public, unauthenticated
-- create-guest-support-case edge function -- there's no user_id to key on,
-- and this endpoint is reachable with no session at all, so it needs its
-- own throttle independent of any per-user limit elsewhere in the app.
CREATE TABLE IF NOT EXISTS public.guest_support_rate_limit (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_guest_support_rate_limit_ip_time
  ON public.guest_support_rate_limit(ip_address, created_at);

ALTER TABLE public.guest_support_rate_limit ENABLE ROW LEVEL SECURITY;
-- No permissive policy -- only the edge function's service-role key ever
-- reads/writes this, same as admin_users above it in the support system.
