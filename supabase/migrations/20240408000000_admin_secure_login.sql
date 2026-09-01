-- Replaces the admin name+password login with a passwordless, one-time-
-- code flow: Generate Code -> emailed to a single fixed admin address ->
-- verify once -> code invalidated -> HttpOnly-cookie session created. The
-- code is never returned to the browser and never stored in plaintext.
--
-- The existing admin_users table/identity model (name, role) is kept --
-- support-case attribution ("assigned to X", "Agent: X") and everything
-- else that reads an AdminIdentity keeps working unchanged. is_primary
-- marks which single row this passwordless flow authenticates as; the
-- seeded 'Gabriel Ngongo' row is that primary admin.
ALTER TABLE public.admin_users
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;

UPDATE public.admin_users SET is_primary = true WHERE name = 'Gabriel Ngongo';

CREATE TABLE IF NOT EXISTS public.admin_login_codes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id   uuid NOT NULL REFERENCES public.admin_users(id) ON DELETE CASCADE,
  -- SHA-256(code + server-side pepper), never the raw code. A 6-digit
  -- code has only 1e6 possibilities, so the pepper (an edge function
  -- secret, never in this table) is what actually makes offline
  -- brute-forcing this column infeasible even with full DB access.
  code_hash  text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts   integer NOT NULL DEFAULT 0,
  used       boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_login_codes_admin ON public.admin_login_codes (admin_id, created_at DESC);

ALTER TABLE public.admin_login_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_login_codes_none" ON public.admin_login_codes;
-- No policy at all -- service-role only (the edge functions), same as
-- admin_users itself. The frontend never reads or writes this table
-- directly.
