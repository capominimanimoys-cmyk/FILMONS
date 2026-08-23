-- Distinguishes "this device is trusted at all" from "this device
-- proved identity recently enough" -- last_used_at (existing) bumps on
-- every device-check ping and is pure activity tracking;
-- last_authenticated_at only ever moves on a real code verification
-- (device-verify-code), and device-check treats a trusted device as
-- untrusted again once it's older than TRUSTED_DEVICE_REAUTH_DAYS
-- (server-side env var, default 30 -- see device-check/index.ts).
ALTER TABLE public.trusted_devices ADD COLUMN IF NOT EXISTS last_authenticated_at timestamptz NOT NULL DEFAULT now();
