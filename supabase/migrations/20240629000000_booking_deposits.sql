-- Refundable security deposit on bookings.
-- The renter pays the deposit ON TOP of the price + Filmons Fee. It is never
-- credited to the host's wallet: it stays 'held' on the order until the host
-- marks the rental / service finished (complete-order edge function), which
-- refunds it to the renter's card.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS deposit_amount          numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deposit_status          text          NOT NULL DEFAULT 'none',  -- none | held | released
  ADD COLUMN IF NOT EXISTS deposit_released_at     timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_deposit_refund_id text,
  ADD COLUMN IF NOT EXISTS completed_at            timestamptz,
  ADD COLUMN IF NOT EXISTS completed_by            uuid;

CREATE INDEX IF NOT EXISTS orders_deposit_held_idx ON public.orders (deposit_status) WHERE deposit_status = 'held';
