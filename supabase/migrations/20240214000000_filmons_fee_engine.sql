-- Filmons Fee (8%).
--
-- Before this, there was no real fee system: a static 5.8% line baked into
-- the generated receipt HTML, a 10%-vs-0% inconsistency between the
-- non-card and card payment paths in Checkout.tsx, and a hardcoded 15%
-- constant used only by the Admin console's transactions tab (itself
-- reconstructed from localStorage, not real data). None of these were
-- persisted or server-authoritative. This migration adds the config table
-- a shared server-side calculation module reads, plus the columns needed
-- to freeze the resulting breakdown onto each order (see
-- supabase/functions/_shared/pricing.ts).
--
-- Tax is deliberately out of scope here: Stripe handles applicable tax on
-- its own, separately, so Filmons never calculates, stores, or displays a
-- tax figure anywhere — no tax_rates table, no tax columns.

CREATE TABLE IF NOT EXISTS public.platform_fee_config (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payer        text NOT NULL CHECK (payer IN ('buyer','seller')),
  fee_type     text NOT NULL CHECK (fee_type IN ('percentage','fixed','percentage_plus_fixed')),
  rate         numeric,
  fixed_amount numeric,
  version      text NOT NULL,
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Seed: 8% buyer-side Filmons Fee, charged to the renter on top of the
-- listing price. No seller row — the owner's gross listing amount is
-- untouched by this fee (the schema supports payer='seller' whenever a
-- seller-side fee is needed later).
INSERT INTO public.platform_fee_config (payer, fee_type, rate, version, active)
SELECT 'buyer', 'percentage', 0.08, '2026.1', true
WHERE NOT EXISTS (SELECT 1 FROM public.platform_fee_config WHERE payer = 'buyer' AND active = true);

ALTER TABLE public.platform_fee_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "platform_fee_config_all" ON public.platform_fee_config;
CREATE POLICY "platform_fee_config_all" ON public.platform_fee_config FOR ALL USING (true) WITH CHECK (true);

-- `orders` is untracked/live — additive only, so nothing existing breaks.
-- Freezes the exact breakdown used for each order (subtotal/fee/total
-- before any Stripe-side adjustments), matching the same "never
-- recalculate history with today's config" principle already used for
-- rental_agreements.pricing_snapshot.
ALTER TABLE IF EXISTS public.orders
  ADD COLUMN IF NOT EXISTS subtotal numeric,
  ADD COLUMN IF NOT EXISTS buyer_fee_rate numeric,
  ADD COLUMN IF NOT EXISTS buyer_fee_amount numeric,
  ADD COLUMN IF NOT EXISTS seller_fee_rate numeric,
  ADD COLUMN IF NOT EXISTS seller_fee_amount numeric,
  ADD COLUMN IF NOT EXISTS fee_config_version text;
