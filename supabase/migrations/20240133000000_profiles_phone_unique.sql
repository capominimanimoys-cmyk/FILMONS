-- Ensure profiles has all phone-signup columns (idempotent — cols may already exist)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS name                    text,
  ADD COLUMN IF NOT EXISTS phone                   text,
  ADD COLUMN IF NOT EXISTS phone_verified          boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_verified          boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_completed    boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS profile_setup_percentage integer DEFAULT 0;

-- Unique partial index: no two rows can share the same phone number.
-- Rows where phone IS NULL are excluded (NULL is not equal to NULL in SQL).
CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_unique
  ON public.profiles(phone)
  WHERE phone IS NOT NULL;
