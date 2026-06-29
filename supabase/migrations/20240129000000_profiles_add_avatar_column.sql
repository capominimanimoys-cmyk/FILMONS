-- profiles.avatar is used as an alias for avatar_url in the app layer.
-- Add it as a real column so writes don't fail.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar text;

-- Back-fill from avatar_url for existing rows.
UPDATE public.profiles
  SET avatar = avatar_url
  WHERE avatar IS NULL AND avatar_url IS NOT NULL;
