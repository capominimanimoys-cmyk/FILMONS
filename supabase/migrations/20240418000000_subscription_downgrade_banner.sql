-- Tracks an auto-downgrade from a paid tier (Professional/Business) back to
-- Creator+/Creator when Stripe exhausts its payment retries and cancels the
-- subscription (customer.subscription.deleted -> fn_deactivate_subscription,
-- see stripe-webhook/index.ts). Lets the UI show a one-time "Your Business
-- account has expired" banner, distinct from an account that was simply
-- always Creator+ and never subscribed at all.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_downgraded_from text,
  ADD COLUMN IF NOT EXISTS subscription_downgrade_acknowledged boolean NOT NULL DEFAULT true;

-- Reverts to creator_plus if the user was already verified, else creator.
-- Now also captures which paid tier they fell FROM (before this same UPDATE
-- overwrites account_type) and flips the banner's acknowledged flag to
-- false, so the frontend can show "Your {tier} account has expired" exactly
-- once. Never touches profile/portfolio/messages/listings/history/Wallet
-- data -- only the subscription/tier columns themselves.
CREATE OR REPLACE FUNCTION fn_deactivate_subscription(p_user_id uuid) RETURNS void AS $$
BEGIN
  UPDATE public.profiles SET
    subscription_downgraded_from = account_type,
    subscription_downgrade_acknowledged = false,
    account_type = CASE WHEN creator_plus_verified THEN 'creator_plus' ELSE 'creator' END,
    account_mode = CASE WHEN creator_plus_verified THEN 'creator_plus' ELSE 'creator' END,
    subscription_status = 'canceled', subscription_cancel_at_period_end = false
  WHERE id = p_user_id;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

-- Webhook-driven only (single authoritative caller per event, not a
-- user-initiated race) -- plain functions, no advisory lock needed.
-- Never touches creator_plus_verified/is_verified -- verification stays
-- independent of subscription plan. Now also clears any pending downgrade
-- banner state -- a successful renewal (whether from a fresh upgrade or
-- from the "Renew Business" banner action) means there is nothing left to
-- show a lapsed-subscription banner for.
CREATE OR REPLACE FUNCTION fn_activate_subscription(
  p_user_id uuid, p_plan text, p_customer_id text, p_subscription_id text, p_period_end timestamptz
) RETURNS void AS $$
BEGIN
  UPDATE public.profiles SET
    account_type = p_plan, account_mode = p_plan,
    stripe_customer_id = p_customer_id, stripe_subscription_id = p_subscription_id,
    subscription_status = 'active', subscription_current_period_end = p_period_end,
    subscription_cancel_at_period_end = false,
    subscription_downgraded_from = null, subscription_downgrade_acknowledged = true
  WHERE id = p_user_id;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;
