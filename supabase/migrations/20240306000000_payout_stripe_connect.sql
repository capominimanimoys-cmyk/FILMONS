-- Payout Method via Stripe Connect — secure Add/Change flow.
-- Filmons previously stored raw bank/Interac details typed directly by
-- hosts (payout_methods.details jsonb) with no re-auth. This migration
-- adds the columns needed to store only SAFE, masked Stripe Connect
-- references instead. Existing rows (method IN interac/bank_transfer,
-- provider defaults to 'manual') are left completely untouched —
-- grandfathered, not migrated.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS stripe_connect_account_id text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS stripe_connect_country text; -- 'CA' | 'US', set once at first onboarding and reused for later "Change" flows

ALTER TABLE public.payout_methods DROP CONSTRAINT IF EXISTS payout_methods_method_check;
ALTER TABLE public.payout_methods ADD CONSTRAINT payout_methods_method_check
  CHECK (method IN ('interac', 'bank_transfer', 'card', 'bank'));
  -- 'card'/'bank' = new Stripe Connect-backed rows; 'interac'/'bank_transfer' = grandfathered legacy rows

ALTER TABLE public.payout_methods ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'manual'; -- 'manual' | 'stripe'
ALTER TABLE public.payout_methods ADD COLUMN IF NOT EXISTS stripe_connect_account_id text;
ALTER TABLE public.payout_methods ADD COLUMN IF NOT EXISTS stripe_external_account_id text;
ALTER TABLE public.payout_methods ADD COLUMN IF NOT EXISTS display_name text; -- e.g. "Visa Debit" or "TD Canada Trust"
ALTER TABLE public.payout_methods ADD COLUMN IF NOT EXISTS last4 text;
ALTER TABLE public.payout_methods ADD COLUMN IF NOT EXISTS country text;
ALTER TABLE public.payout_methods ADD COLUMN IF NOT EXISTS currency text;
ALTER TABLE public.payout_methods ADD COLUMN IF NOT EXISTS standard_payout_eligible boolean NOT NULL DEFAULT false;
ALTER TABLE public.payout_methods ADD COLUMN IF NOT EXISTS instant_payout_eligible boolean NOT NULL DEFAULT false;
ALTER TABLE public.payout_methods ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ready'; -- 'pending' | 'ready' | 'incomplete'
ALTER TABLE public.payout_methods ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
