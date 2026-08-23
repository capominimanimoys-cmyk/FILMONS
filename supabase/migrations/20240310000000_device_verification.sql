-- New Browser / First Sign-In Verification. Only hashes are ever stored
-- for both the device token and the 6-digit code -- same "never store
-- the sensitive raw value" convention as admin_users/payout_methods.

CREATE TABLE public.trusted_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  device_token_hash text NOT NULL UNIQUE,
  browser_info text,
  device_info text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days'),
  revoked_at timestamptz
);
CREATE INDEX idx_trusted_devices_user ON public.trusted_devices(user_id);
ALTER TABLE public.trusted_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY trusted_devices_all ON public.trusted_devices FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.device_verification_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  used_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_device_verification_codes_user ON public.device_verification_codes(user_id, created_at DESC);
ALTER TABLE public.device_verification_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY device_verification_codes_all ON public.device_verification_codes FOR ALL USING (true) WITH CHECK (true);
