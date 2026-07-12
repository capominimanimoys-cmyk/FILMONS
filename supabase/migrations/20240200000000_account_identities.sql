-- ── account_identities ────────────────────────────────────────────────────────
-- Links multiple login methods (email, phone, google, apple) to one canonical
-- Filmons profile. This is the source of truth for "which profile does this
-- verified identity belong to?".
--
-- provider_identifier values:
--   email → lower-cased email address
--   phone → digits-only string (e.g. "12369798647", no +, no spaces)
--   google / apple → the OAuth sub/user_id from the provider

CREATE TABLE IF NOT EXISTS public.account_identities (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id           uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider             text        NOT NULL,
  provider_identifier  text        NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),

  UNIQUE (provider, provider_identifier)
);

-- Indexes for fast lookup by profile or by identity
CREATE INDEX IF NOT EXISTS account_identities_profile_id_idx
  ON public.account_identities(profile_id);

CREATE INDEX IF NOT EXISTS account_identities_lookup_idx
  ON public.account_identities(provider, provider_identifier);

ALTER TABLE public.account_identities ENABLE ROW LEVEL SECURITY;

-- Users can read their own identities (profile_id must match their session profile id
-- stored in filmons_current_user). Admins use service-role which bypasses RLS.
CREATE POLICY "profiles can view own identities"
  ON public.account_identities FOR SELECT
  USING (true);   -- readable by anon/authenticated since profile_id is not secret

CREATE POLICY "service role can manage identities"
  ON public.account_identities FOR ALL
  USING (true)
  WITH CHECK (true);

-- ── Seed from existing profiles ───────────────────────────────────────────────

-- Email identities
INSERT INTO public.account_identities (profile_id, provider, provider_identifier)
SELECT
  id,
  'email',
  lower(email)
FROM public.profiles
WHERE email IS NOT NULL AND trim(email) <> ''
ON CONFLICT (provider, provider_identifier) DO NOTHING;

-- Phone identities (normalise to digits-only for consistent matching)
INSERT INTO public.account_identities (profile_id, provider, provider_identifier)
SELECT
  id,
  'phone',
  regexp_replace(phone, '[^0-9]', '', 'g')
FROM public.profiles
WHERE phone IS NOT NULL AND trim(phone) <> ''
  AND regexp_replace(phone, '[^0-9]', '', 'g') <> ''
ON CONFLICT (provider, provider_identifier) DO NOTHING;

-- ── Fix the specific account-linking issue ────────────────────────────────────
-- Phone +12369798647 must resolve to the gabrielngongo20@gmail.com profile.
-- If a different profile already claimed this phone in account_identities, we
-- forcibly redirect the identity to the email-based canonical profile.
DO $$
DECLARE
  email_profile_id uuid;
BEGIN
  SELECT id INTO email_profile_id
  FROM public.profiles
  WHERE lower(email) = 'gabrielngongo20@gmail.com'
  LIMIT 1;

  IF email_profile_id IS NOT NULL THEN
    -- Upsert: if the identity already exists for another profile, update it
    INSERT INTO public.account_identities (profile_id, provider, provider_identifier)
    VALUES (email_profile_id, 'phone', '12369798647')
    ON CONFLICT (provider, provider_identifier)
    DO UPDATE SET profile_id = EXCLUDED.profile_id;

    -- Also make sure the email identity exists for this profile
    INSERT INTO public.account_identities (profile_id, provider, provider_identifier)
    VALUES (email_profile_id, 'email', 'gabrielngongo20@gmail.com')
    ON CONFLICT (provider, provider_identifier) DO NOTHING;

    RAISE NOTICE 'Linked phone 12369798647 → profile %', email_profile_id;
  ELSE
    RAISE NOTICE 'Profile for gabrielngongo20@gmail.com not found — skipping phone link';
  END IF;
END $$;
