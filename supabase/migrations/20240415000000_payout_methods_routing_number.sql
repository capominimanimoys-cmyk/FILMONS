-- payout_methods.routing_number -- the bank/branch routing identifier
-- (e.g. Canada's "institution-transit" format, "03716-003") for the
-- synced Stripe external account, displayed alongside bank_name/last4/
-- currency on the Wallet page. Not sensitive the way a full account
-- number is (Stripe returns it in full for the connected account's own
-- external accounts, and routing numbers are publicly knowable for any
-- cheque anyway), so it's stored and shown unmasked, unlike last4.
ALTER TABLE public.payout_methods
  ADD COLUMN IF NOT EXISTS routing_number text;
