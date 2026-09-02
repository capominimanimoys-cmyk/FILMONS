-- Trust & Reliability Score — computed server-side only, from reviews,
-- completed jobs/bookings, cancellations, disputes, and account history
-- (weighted composite, see fn_recalculate_trust_score below for the exact
-- formula and weights).
--
-- reputation_scores/reputation_events/trust_badges were created directly in
-- the live Supabase project (no CREATE TABLE for them anywhere in this
-- migrations directory), so the CREATE TABLE IF NOT EXISTS / ADD COLUMN IF
-- NOT EXISTS statements below are additive guards, not a fresh schema --
-- they must not assume the live table is empty or column-for-column what's
-- declared here.
--
-- Manipulation vectors this closes:
--   1. reliabilityApi.logEvent() inserts straight into reputation_events
--      from the browser with a client-chosen score_delta (currently unused
--      by any call site, but fully wired and exploitable via the anon key
--      even without that JS function, since RLS on the table was open).
--   2. GoogleSignup.tsx / reliabilityApi.getScore() upsert/insert directly
--      into reputation_scores from the browser (only ever write 0, but
--      prove the table accepted arbitrary client writes).
-- Both tables lose their INSERT/UPDATE/DELETE policies below -- SELECT
-- stays open (the UI still needs to read scores/events), but only the
-- service role (edge functions, and SECURITY DEFINER functions owned by
-- it) can write, same boundary this codebase already uses for wallets/
-- boost/emergency listings.

CREATE TABLE IF NOT EXISTS public.reputation_scores (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at         timestamptz NOT NULL DEFAULT now()
);
-- account_type is declared as its own ADD COLUMN (not inside the CREATE
-- TABLE above) because that CREATE TABLE is a no-op whenever the table
-- already exists live -- which it does -- so any column only declared
-- inline there would silently never get added to the real table.
ALTER TABLE public.reputation_scores ADD COLUMN IF NOT EXISTS account_type       text NOT NULL DEFAULT 'creator';
ALTER TABLE public.reputation_scores ADD COLUMN IF NOT EXISTS reliability_score  numeric NOT NULL DEFAULT 0;
ALTER TABLE public.reputation_scores ADD COLUMN IF NOT EXISTS reliability_level  text NOT NULL DEFAULT 'new_user';
ALTER TABLE public.reputation_scores ADD COLUMN IF NOT EXISTS review_pts         numeric NOT NULL DEFAULT 0;
ALTER TABLE public.reputation_scores ADD COLUMN IF NOT EXISTS review_count       integer NOT NULL DEFAULT 0;
ALTER TABLE public.reputation_scores ADD COLUMN IF NOT EXISTS review_rating_avg  numeric;
ALTER TABLE public.reputation_scores ADD COLUMN IF NOT EXISTS updated_at         timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS idx_reputation_scores_user_id ON public.reputation_scores(user_id);

CREATE TABLE IF NOT EXISTS public.reputation_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid,
  event_type   text,
  dimension    text,
  score_delta  numeric,
  reason       text,
  related_id   uuid,
  verified     boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Defense-in-depth: create-review already blocks a self-review in the edge
-- function (listing.user_id === userId), but nothing at the DB level
-- stopped a direct insert (e.g. straight to PostgREST) from setting
-- reviewed_user_id = user_id. Belt-and-suspenders against the "don't allow
-- a user to increase their own score by reviewing themselves" requirement.
-- NOT VALID: enforced for every new/updated row from here on, but doesn't
-- require scanning/validating whatever rows already exist in the live
-- table -- a legacy self-review row (if one somehow exists) must not be
-- able to fail this whole migration.
DO $$
BEGIN
  ALTER TABLE public.reviews
    ADD CONSTRAINT reviews_no_self_review CHECK (reviewed_user_id IS NULL OR reviewed_user_id <> user_id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Recalculation ────────────────────────────────────────────────────────
-- Full weighted composite (not just reviews), per spec:
--   Reviews 40% + Completed jobs 25% + Cancellations/no-shows 15%
--   + Response reliability 10% + Disputes/reports 5% + Account history 5%
-- Every input below is read from a real, already-existing column (no
-- fabricated data). "Response reliability" has NO trackable source
-- anywhere in this schema yet (no message-response-time or
-- ignored-opportunity table) -- rather than invent a number for it, its
-- 10% weight is proportionally redistributed across the five components
-- that do have real data (40+25+15+5+5=90, scaled by 100/90). Add a real
-- response-tracking table later and this component can be reintroduced at
-- its full weight without touching anything else here.
--
-- This is a full recompute every time (not a delta patch against whatever
-- was previously stored) -- idempotent regardless of call order, and the
-- single source of truth for reliability_score/reliability_level from now
-- on (no other untracked trigger should also be writing these columns;
-- check the Supabase dashboard for one and remove it if so).
CREATE OR REPLACE FUNCTION public.fn_recalculate_trust_score(p_user_id uuid)
RETURNS void AS $$
DECLARE
  v_review_count      integer;
  v_review_raw        numeric;
  v_review_avg        numeric;
  v_review_pts        numeric;
  v_review_component  numeric;

  v_completed_count   integer;
  v_jobs_component    numeric;

  v_cancel_count      integer;
  v_cancel_component  numeric;

  v_dispute_count     integer;
  v_dispute_component numeric;

  v_account_created   timestamptz;
  v_age_days          numeric;
  v_verified_count    integer;
  v_history_component numeric;

  v_account_type      text;
  v_is_plus           boolean;
  v_final_score       numeric;
  v_new_level         text;
BEGIN
  IF p_user_id IS NULL THEN RETURN; END IF;

  -- Reviews (40%) -- per-star point value follows "5-star strong positive
  -- ... 1-star stronger negative" literally, summed across every review
  -- this user has received, then passed through tanh() for diminishing
  -- returns: a single 5-star review (raw sum 4) barely moves the 0-100
  -- component off its 50 (neutral/no-reviews) baseline, while a sustained
  -- run of good reviews saturates toward 100. review_pts keeps the old
  -- +/-20 scale alongside this for the existing RENTER_BREAKDOWN UI bar
  -- (src/app/lib/reliabilityApi.ts), which is a different, smaller-range
  -- display than review_component below.
  SELECT
    count(*),
    coalesce(sum(CASE rating WHEN 5 THEN 4 WHEN 4 THEN 2 WHEN 3 THEN 0 WHEN 2 THEN -4 WHEN 1 THEN -8 ELSE 0 END), 0),
    avg(rating)
  INTO v_review_count, v_review_raw, v_review_avg
  FROM public.reviews
  WHERE reviewed_user_id = p_user_id;
  v_review_pts       := round((20 * tanh(v_review_raw / 20.0))::numeric, 2);
  v_review_component := round((50 + 50 * tanh(v_review_raw / 20.0))::numeric, 2);

  -- Completed jobs/bookings (25%) -- real completions across every paid
  -- flow this app has: hire, paid Opportunity, and rental/marketplace
  -- orders. Saturating curve (not a hard cap) so sustained completed work
  -- keeps outweighing a single review, per "completed work and consistent
  -- behavior should be what makes the score really strong."
  -- orders is not defined in any tracked migration (untracked/live-only
  -- base table, same situation noted in 20240218000000_refunds_disputes.sql)
  -- so its exact column types aren't verifiable from this repo -- host_id
  -- is cast to text on both sides of every comparison below so this can't
  -- fail with an operator/type mismatch regardless of whether it's really
  -- uuid or text live.
  SELECT
      (SELECT count(*) FROM public.hire_transactions WHERE (requester_id = p_user_id OR host_id = p_user_id) AND work_status = 'completed')
    + (SELECT count(*) FROM public.opportunity_transactions WHERE (owner_id = p_user_id OR worker_id = p_user_id) AND work_status = 'completed')
    + (SELECT count(*) FROM public.orders WHERE host_id::text = p_user_id::text AND status = 'paid')
  INTO v_completed_count;
  v_jobs_component := round((100 * (1 - exp(-v_completed_count::numeric / 8.0)))::numeric, 2);

  -- Cancellations/no-shows (15%) -- hire_transactions/opportunity_
  -- transactions have no "who cancelled" column and this schema has no
  -- no-show tracking at all, so fault can't be attributed. Rather than
  -- guess (and risk penalizing whoever didn't cause it), the decay is
  -- deliberately gentle -- the honest version of "mutual cancellations
  -- should have little or no penalty" given the data actually available.
  SELECT
      (SELECT count(*) FROM public.hire_transactions WHERE (requester_id = p_user_id OR host_id = p_user_id) AND payment_status = 'cancelled')
    + (SELECT count(*) FROM public.opportunity_transactions WHERE (owner_id = p_user_id OR worker_id = p_user_id) AND payment_status = 'cancelled')
  INTO v_cancel_count;
  v_cancel_component := round((100 * exp(-v_cancel_count::numeric / 6.0))::numeric, 2);

  -- Disputes/reports (5%) -- only a refund_requests row that was actually
  -- approved (i.e. resolved against this user as the paying order's host)
  -- counts. A bare unresolved report never touches this.
  SELECT count(*) INTO v_dispute_count
  FROM public.refund_requests rr
  JOIN public.orders o ON o.id::text = rr.order_id::text
  WHERE o.host_id::text = p_user_id::text AND rr.status = 'approved';
  v_dispute_component := round((100 * exp(-v_dispute_count::numeric / 2.0))::numeric, 2);

  -- Account history (5%) -- account age (capped at 1 year) plus identity/
  -- contact verification. No "major trust violations" flag exists in this
  -- schema to subtract for, so this component is purely additive.
  SELECT created_at, account_type INTO v_account_created, v_account_type FROM public.profiles WHERE id = p_user_id;
  v_age_days := coalesce((EXTRACT(epoch FROM (now() - v_account_created)) / 86400.0)::numeric, 0);
  -- account_verifications is untracked (no CREATE TABLE anywhere in this
  -- migrations directory, same situation as orders) -- user_id there turns
  -- out to be text, not uuid, hence the cast; profiles.id right below is
  -- confirmed uuid (used bare, no cast, earlier in this same function).
  SELECT
      (CASE WHEN EXISTS (SELECT 1 FROM public.account_verifications WHERE user_id::text = p_user_id::text AND identity_verified = true) THEN 1 ELSE 0 END)
    + (CASE WHEN EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND (email_verified = true OR phone_verified = true)) THEN 1 ELSE 0 END)
  INTO v_verified_count;
  v_history_component := LEAST(100, round((LEAST(v_age_days, 365) / 365.0 * 70 + v_verified_count / 2.0 * 30)::numeric, 2));

  v_is_plus := v_account_type IN ('creator_plus', 'professional', 'business');

  v_final_score := GREATEST(0, LEAST(100, round((
    (v_review_component * 40 + v_jobs_component * 25 + v_cancel_component * 15 + v_dispute_component * 5 + v_history_component * 5) / 90.0
  )::numeric, 2)));

  v_new_level := CASE
    WHEN v_is_plus THEN CASE
      WHEN v_final_score >= 90 THEN 'elite_creator_plus'
      WHEN v_final_score >= 75 THEN 'trusted_creator_plus'
      WHEN v_final_score >= 50 THEN 'reliable_creator_plus'
      WHEN v_final_score >= 20 THEN 'building_trust'
      ELSE 'new_creator_plus'
    END
    ELSE CASE
      WHEN v_final_score >= 85 THEN 'elite'
      WHEN v_final_score >= 60 THEN 'trusted_creator'
      WHEN v_final_score >= 30 THEN 'reliable'
      WHEN v_final_score >= 10 THEN 'building_trust'
      ELSE 'new_user'
    END
  END;

  INSERT INTO public.reputation_scores (user_id, account_type)
    VALUES (p_user_id::text, coalesce(v_account_type, 'creator'))
    ON CONFLICT (user_id) DO NOTHING;

  -- reputation_scores.user_id is text on the live table (same untracked-
  -- live-schema situation as account_verifications/orders noted above,
  -- despite the CREATE TABLE at the top of this file declaring it uuid --
  -- that CREATE TABLE is a no-op since the table already existed live).
  -- Bare `user_id = p_user_id` has no uuid = text operator, which is
  -- exactly the "operator does not exist: text = uuid" error this line
  -- was throwing and rolling back the whole migration (including the
  -- one-time backfill loop below) on.
  UPDATE public.reputation_scores SET
    review_pts        = v_review_pts,
    review_count       = v_review_count,
    review_rating_avg  = v_review_avg,
    reliability_score  = v_final_score,
    reliability_level  = v_new_level,
    account_type       = coalesce(v_account_type, account_type),
    updated_at         = now()
  WHERE user_id::text = p_user_id::text;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fires on every insert/update/delete against reviews, regardless of which
-- code path performed the write (create-review edge function today; any
-- future edit/delete flow automatically too) -- this is what satisfies
-- "recalculate after review submission" and "recalculate after a review is
-- edited or removed" without needing every review-writing call site to
-- remember to call something after the fact. The other four components
-- (jobs/cancellations/disputes/history) are recomputed fresh every time
-- this fires too, since it's a full recompute -- they just don't have
-- their own trigger yet, so they go stale until the next review event for
-- this user. Wiring hire/opportunity/order completion to also call
-- fn_recalculate_trust_score directly would close that gap.
CREATE OR REPLACE FUNCTION public.fn_trg_reviews_recalc_trust()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.fn_recalculate_trust_score(OLD.reviewed_user_id);
    RETURN OLD;
  END IF;
  PERFORM public.fn_recalculate_trust_score(NEW.reviewed_user_id);
  IF TG_OP = 'UPDATE' AND OLD.reviewed_user_id IS DISTINCT FROM NEW.reviewed_user_id THEN
    PERFORM public.fn_recalculate_trust_score(OLD.reviewed_user_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_reviews_recalc_trust ON public.reviews;
CREATE TRIGGER trg_reviews_recalc_trust
  AFTER INSERT OR UPDATE OF rating, reviewed_user_id OR DELETE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.fn_trg_reviews_recalc_trust();

-- ── RLS lockdown ─────────────────────────────────────────────────────────
-- Read stays open (same app-wide model as everywhere else in this schema —
-- see project_auth_model); write is removed for anon/authenticated so only
-- the service role (edge functions) and SECURITY DEFINER functions above
-- can move a score. Existing policy names on these tables aren't known
-- (created outside tracked migrations), so drop whatever's there by
-- querying pg_policies rather than guessing names.
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'reputation_scores' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.reputation_scores', pol.policyname);
  END LOOP;
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'reputation_events' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.reputation_events', pol.policyname);
  END LOOP;
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'reviews' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.reviews', pol.policyname);
  END LOOP;
END $$;

ALTER TABLE public.reputation_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reputation_scores_select" ON public.reputation_scores FOR SELECT USING (true);

ALTER TABLE public.reputation_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reputation_events_select" ON public.reputation_events FOR SELECT USING (true);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reviews_select" ON public.reviews FOR SELECT USING (true);

-- One-time backfill so every user with any signal this formula reads from
-- (reviews, completed hire/opportunity work, or paid rental orders) gets a
-- correct score immediately, instead of only on their next review.
DO $$
DECLARE uid uuid;
BEGIN
  FOR uid IN
    SELECT reviewed_user_id FROM public.reviews WHERE reviewed_user_id IS NOT NULL
    UNION
    SELECT host_id FROM public.hire_transactions WHERE host_id IS NOT NULL
    UNION
    SELECT requester_id FROM public.hire_transactions WHERE requester_id IS NOT NULL
    UNION
    SELECT owner_id FROM public.opportunity_transactions WHERE owner_id IS NOT NULL
    UNION
    SELECT worker_id FROM public.opportunity_transactions WHERE worker_id IS NOT NULL
    UNION
    SELECT host_id::uuid FROM public.orders WHERE host_id IS NOT NULL
  LOOP
    PERFORM public.fn_recalculate_trust_score(uid);
  END LOOP;
END $$;
