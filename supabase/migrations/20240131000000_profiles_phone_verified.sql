-- Add phone_verified column to profiles.
-- Existing users with a phone number are treated as already verified.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone_verified boolean DEFAULT false;

-- Backfill: any existing row that has a phone number is considered verified
-- (they authenticated before this column existed).
UPDATE public.profiles
   SET phone_verified = true
 WHERE phone IS NOT NULL AND phone <> '';
