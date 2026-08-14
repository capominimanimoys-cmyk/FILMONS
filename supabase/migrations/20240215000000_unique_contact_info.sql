-- Unique email/phone per Filmons account.
--
-- profiles.phone already has a unique partial index (20240133000000). This
-- adds the missing counterpart for email, so a duplicate signup or an
-- account-settings email/phone change can never silently create two
-- profiles rows sharing the same contact info — the insert/update itself
-- throws (Postgres unique_violation, code 23505), even if a client bypasses
-- the UI entirely.
--
-- account_identities (20240200000000) is the atomic claim point used by the
-- new claim-identity Edge Function for cases that need to distinguish
-- "already yours" from "already someone else's" without a client-visible DB
-- error — settings changes and sign-in-method linking. Plain signup relies
-- on this unique index as the backstop instead (simpler: no claim-then-
-- rollback dance needed since profiles.id doesn't exist yet at claim time).
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_unique
  ON public.profiles (lower(email))
  WHERE email IS NOT NULL AND trim(email) <> '';
