-- payout_methods.details was created NOT NULL (20240218000000), but the
-- Stripe Connect rewrite (20240306000000) intentionally writes
-- details: null for Stripe-backed rows -- masked Stripe references never
-- store raw destination data, unlike grandfathered manual
-- (interac/bank_transfer) rows which still populate it. That constraint
-- was never relaxed, so every host's *first* Stripe-backed payout_methods
-- insert (the sync-payout-method-status/webhook self-heal path in
-- _shared/payoutMethodSync.ts) has been failing silently on this NOT NULL
-- violation ever since.
ALTER TABLE public.payout_methods ALTER COLUMN details DROP NOT NULL;
