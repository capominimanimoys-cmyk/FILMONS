-- Add email_verified flag to profiles.
-- Defaults to false for new rows; existing accounts are backfilled as verified.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_verified boolean DEFAULT false;

-- All existing accounts pre-date this feature — treat them as already verified.
UPDATE public.profiles
  SET email_verified = true
  WHERE email_verified IS NOT TRUE;
