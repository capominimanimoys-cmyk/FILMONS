-- Richer applicant pipeline + application fields for the dedicated
-- Opportunity Create Listing wizard. Structured opportunity fields
-- themselves (type, role, dates, compensation, requirements, application
-- config) live in listings.metadata.opportunity — no new listings columns.
ALTER TABLE public.opportunity_applications
  DROP CONSTRAINT IF EXISTS opportunity_applications_status_check;
ALTER TABLE public.opportunity_applications
  ADD CONSTRAINT opportunity_applications_status_check
  CHECK (status IN ('pending','shortlisted','contacted','accepted','rejected'));
  -- 'pending' displays as "New" in the UI — existing rows already use this value.

ALTER TABLE public.opportunity_applications
  ADD COLUMN IF NOT EXISTS portfolio_url text,
  ADD COLUMN IF NOT EXISTS resume_url text,
  ADD COLUMN IF NOT EXISTS demo_reel_url text,
  ADD COLUMN IF NOT EXISTS availability text,
  ADD COLUMN IF NOT EXISTS expected_rate text,
  ADD COLUMN IF NOT EXISTS custom_answers jsonb NOT NULL DEFAULT '{}';
