-- Add onboarding tracking columns that Onboarding.tsx writes directly
-- to the profiles table (outside of profile_meta JSON).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed     boolean  DEFAULT false,
  ADD COLUMN IF NOT EXISTS profile_setup_percentage integer  DEFAULT 0;

-- Backfill: any row whose profile_meta already marks onboarding as done
-- should be reflected in the new columns too.
UPDATE public.profiles
   SET onboarding_completed     = true,
       profile_setup_percentage = 100
 WHERE profile_meta->>'onboarding_completed' = 'true'
    OR (profile_meta IS NOT NULL AND profile_meta ? 'onboarding_completed'
        AND (profile_meta->>'onboarding_completed')::boolean = true);
