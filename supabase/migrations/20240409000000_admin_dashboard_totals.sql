-- Lifetime financial totals for the new Admin Dashboard home page
-- (Gross Volume, Platform Revenue). Client-side summing would mean
-- fetching every orders/wallet_transactions row ever created just to
-- add them up -- wasteful and, past a page-size cap, actually wrong.
-- A single aggregate query is the correct way to compute this.
CREATE OR REPLACE FUNCTION fn_admin_dashboard_totals()
RETURNS TABLE (gross_volume numeric, platform_revenue numeric)
LANGUAGE sql STABLE
AS $$
  SELECT
    COALESCE((SELECT SUM(total_amount) FROM orders WHERE paid_at IS NOT NULL), 0) AS gross_volume,
    COALESCE((SELECT SUM(amount) FROM wallet_transactions WHERE transaction_type = 'filmons_fee'), 0) AS platform_revenue;
$$;
