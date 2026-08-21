-- Unifies the Inbox "Application Card" and the Dashboard "Applicants
-- Manager" around one opportunity_applications row per application. Adds
-- the status values/timestamps both surfaces need, plus a real link from a
-- conversation to the specific (opportunity, applicant) pair it belongs to
-- — today conversations are keyed only by user-pair, so the same applicant
-- applying to two different opportunities from the same host collided into
-- one thread. See project memory for why conversations/messages have no
-- tracked CREATE TABLE migration (set up directly in Supabase).

-- Status enum: keep existing values (pending displays "New", rejected
-- displays "Declined" — already the established UI mapping). Only adding
-- 'viewed' and 'withdrawn', never renaming existing values/rows.
ALTER TABLE public.opportunity_applications DROP CONSTRAINT IF EXISTS opportunity_applications_status_check;
ALTER TABLE public.opportunity_applications ADD CONSTRAINT opportunity_applications_status_check
  CHECK (status IN ('pending','viewed','shortlisted','contacted','accepted','rejected','withdrawn'));

ALTER TABLE public.opportunity_applications
  ADD COLUMN IF NOT EXISTS viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS shortlisted_at timestamptz,
  ADD COLUMN IF NOT EXISTS contacted_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS declined_at timestamptz,
  ADD COLUMN IF NOT EXISTS withdrawn_at timestamptz,
  ADD COLUMN IF NOT EXISTS decline_reason text,
  ADD COLUMN IF NOT EXISTS host_notes text,        -- owner-only, never returned to the applicant
  ADD COLUMN IF NOT EXISTS owner_id uuid,           -- denormalized display convenience only, NOT the security check
  ADD COLUMN IF NOT EXISTS accepted_details jsonb,  -- optional {position, agreedRate, startDate}
  ADD COLUMN IF NOT EXISTS conversation_id text;    -- text, not uuid — conversations.id isn't consistently uuid client-side

CREATE INDEX IF NOT EXISTS opportunity_applications_status_idx ON public.opportunity_applications (listing_id, status);

-- conversations/messages were never created via a tracked migration in this
-- repo (set up directly in Supabase) — IF EXISTS is defensive.
ALTER TABLE IF EXISTS public.conversations
  ADD COLUMN IF NOT EXISTS opportunity_id text,
  ADD COLUMN IF NOT EXISTS application_id uuid REFERENCES public.opportunity_applications(id);

CREATE UNIQUE INDEX IF NOT EXISTS conversations_application_id_uidx
  ON public.conversations (application_id) WHERE application_id IS NOT NULL;
