-- Cross-currency automated payouts: Filmons' wallet ledger is entirely
-- CAD, but a US-based Stripe Custom account's bank account can only
-- receive USD payouts (Stripe rejects a CAD-denominated Payout against a
-- USD external_account). This tracks the actual destination-currency
-- amount alongside the CAD amount already debited from the wallet, since
-- they're no longer always the same number once a US destination
-- converts at Stripe's own exchange rate.
ALTER TABLE public.payout_requests ADD COLUMN IF NOT EXISTS payout_currency text;
  -- The currency actually sent to the bank (e.g. 'USD') -- null/absent
  -- means it matched `currency` (CAD) exactly, no conversion happened.
ALTER TABLE public.payout_requests ADD COLUMN IF NOT EXISTS payout_amount numeric;
  -- The amount in `payout_currency` that Stripe's Payout object actually
  -- reported sending -- the real, post-conversion figure, never a
  -- pre-conversion estimate.
