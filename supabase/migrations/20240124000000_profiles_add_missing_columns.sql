-- Add columns to profiles that the app writes but may be absent from the initial schema.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen      timestamptz,
  ADD COLUMN IF NOT EXISTS primary_role   text,
  ADD COLUMN IF NOT EXISTS secondary_roles jsonb    DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS skills         jsonb    DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS gear           jsonb    DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS collab_prefs   jsonb    DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS education      jsonb    DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS years_exp      integer,
  ADD COLUMN IF NOT EXISTS occupation     text,
  ADD COLUMN IF NOT EXISTS vimeo          text,
  ADD COLUMN IF NOT EXISTS linkedin       text,
  ADD COLUMN IF NOT EXISTS postal_code    text,
  ADD COLUMN IF NOT EXISTS street_address text,
  ADD COLUMN IF NOT EXISTS banner_url     text,
  ADD COLUMN IF NOT EXISTS cover_photo    text,
  ADD COLUMN IF NOT EXISTS birthdate      text,
  ADD COLUMN IF NOT EXISTS contact_public boolean  DEFAULT false,
  ADD COLUMN IF NOT EXISTS account_category text;
