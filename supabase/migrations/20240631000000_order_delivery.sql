-- Delivery chosen at checkout: fee (already included in the order's subtotal) and the address to deliver to.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_fee     numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_address text;
