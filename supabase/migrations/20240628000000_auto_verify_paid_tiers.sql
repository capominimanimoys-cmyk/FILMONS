-- Business, Professional and Creator+ accounts are treated as verified automatically (no Filmons ID check).
-- Verified-by-tier is remembered in auto_verified so it switches off again if the account drops back to Creator --
-- an account verified through the real ID flow is never touched.
-- (Stripe still enforces its own identity checks on payout accounts; this does not and cannot change that.)

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS auto_verified boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.fn_auto_verify_paid_tiers() RETURNS trigger AS $$
DECLARE
  v_paid boolean := new.account_type IN ('business', 'professional', 'creator_plus', 'service')
                 OR new.account_mode IN ('business', 'professional', 'creator_plus', 'service');
BEGIN
  IF v_paid THEN
    IF coalesce(new.is_verified, false) = false THEN
      new.is_verified := true;
      new.verification_status := 'approved';
      new.auto_verified := true;
    END IF;
  ELSIF new.auto_verified THEN
    -- dropped back to a free tier: the automatic verification ends with the plan
    new.is_verified := false;
    new.verification_status := 'not_started';
    new.auto_verified := false;
  END IF;
  RETURN new;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_verify_paid_tiers ON public.profiles;
CREATE TRIGGER trg_auto_verify_paid_tiers
  BEFORE INSERT OR UPDATE OF account_type, account_mode, is_verified ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.fn_auto_verify_paid_tiers();

-- Existing paid accounts
UPDATE public.profiles
SET is_verified = true, verification_status = 'approved', auto_verified = true
WHERE coalesce(is_verified, false) = false
  AND (account_type IN ('business', 'professional', 'creator_plus', 'service')
    OR account_mode IN ('business', 'professional', 'creator_plus', 'service'));
