-- Reviews -> Trust & Reliability Score, computed server-side only.
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
-- Per-star point value follows the requested "5-star strong positive ...
-- 1-star stronger negative" shape literally. Summed across every review a
-- user has received, then passed through tanh() to (a) bound the result to
-- +/-20 -- matching the existing review_pts cap already used by the
-- RENTER_BREAKDOWN UI (src/app/lib/reliabilityApi.ts) -- and (b) give
-- diminishing returns, so a single 5-star review (raw sum 4) lands around
-- +3.9, nowhere near the cap, while a sustained run of good reviews (raw
-- sum >= ~40) saturates near +20. That's the "one 5-star review should not
-- instantly give someone a near-perfect score, consistent positive history
-- should score higher than a single review" requirement, expressed as math
-- instead of a special case.
--
-- The function only ever adjusts reliability_score by the *change* in
-- review_pts (new minus whatever was previously stored), not by
-- overwriting the whole score -- reliability_score has other dimensions
-- (verification, host/service activity, etc.) computed elsewhere in the
-- live project that this migration doesn't have visibility into and must
-- not clobber.
CREATE OR REPLACE FUNCTION public.fn_recalculate_review_trust(p_user_id uuid)
RETURNS void AS $$
DECLARE
  v_count       integer;
  v_raw_sum     numeric;
  v_avg_rating  numeric;
  v_new_pts     numeric;
  v_old_pts     numeric := 0;
  v_old_score   numeric := 0;
  v_account_type text;
  v_is_plus     boolean;
  v_new_score   numeric;
  v_new_level   text;
BEGIN
  IF p_user_id IS NULL THEN RETURN; END IF;

  SELECT
    count(*),
    coalesce(sum(CASE rating WHEN 5 THEN 4 WHEN 4 THEN 2 WHEN 3 THEN 0 WHEN 2 THEN -4 WHEN 1 THEN -8 ELSE 0 END), 0),
    avg(rating)
  INTO v_count, v_raw_sum, v_avg_rating
  FROM public.reviews
  WHERE reviewed_user_id = p_user_id;

  v_new_pts := round(20 * tanh(v_raw_sum / 20.0), 2);

  SELECT account_type INTO v_account_type FROM public.profiles WHERE id = p_user_id;
  v_is_plus := v_account_type IN ('creator_plus', 'professional', 'business');

  -- Ensure a row exists, then lock it before reading the previous
  -- review_pts contribution so two concurrent recalculations (e.g. a
  -- review edited right after being posted) can't race each other.
  INSERT INTO public.reputation_scores (user_id, account_type)
    VALUES (p_user_id, coalesce(v_account_type, 'creator'))
    ON CONFLICT (user_id) DO NOTHING;

  SELECT review_pts, reliability_score INTO v_old_pts, v_old_score
    FROM public.reputation_scores WHERE user_id = p_user_id FOR UPDATE;

  v_new_score := greatest(0, least(100, coalesce(v_old_score, 0) - coalesce(v_old_pts, 0) + v_new_pts));

  v_new_level := CASE
    WHEN v_is_plus THEN CASE
      WHEN v_new_score >= 90 THEN 'elite_creator_plus'
      WHEN v_new_score >= 75 THEN 'trusted_creator_plus'
      WHEN v_new_score >= 50 THEN 'reliable_creator_plus'
      WHEN v_new_score >= 20 THEN 'building_trust'
      ELSE 'new_creator_plus'
    END
    ELSE CASE
      WHEN v_new_score >= 85 THEN 'elite'
      WHEN v_new_score >= 60 THEN 'trusted_creator'
      WHEN v_new_score >= 30 THEN 'reliable'
      WHEN v_new_score >= 10 THEN 'building_trust'
      ELSE 'new_user'
    END
  END;

  UPDATE public.reputation_scores SET
    review_pts        = v_new_pts,
    review_count       = v_count,
    review_rating_avg  = v_avg_rating,
    reliability_score  = v_new_score,
    reliability_level  = v_new_level,
    account_type       = coalesce(v_account_type, account_type),
    updated_at         = now()
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fires on every insert/update/delete against reviews, regardless of which
-- code path performed the write (create-review edge function today; any
-- future edit/delete flow automatically too) -- this is what satisfies
-- "recalculate after review submission" and "recalculate after a review is
-- edited or removed" without needing every review-writing call site to
-- remember to call something after the fact.
CREATE OR REPLACE FUNCTION public.fn_trg_reviews_recalc_trust()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.fn_recalculate_review_trust(OLD.reviewed_user_id);
    RETURN OLD;
  END IF;
  PERFORM public.fn_recalculate_review_trust(NEW.reviewed_user_id);
  IF TG_OP = 'UPDATE' AND OLD.reviewed_user_id IS DISTINCT FROM NEW.reviewed_user_id THEN
    PERFORM public.fn_recalculate_review_trust(OLD.reviewed_user_id);
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

-- One-time backfill so every user who already has reviews gets a correct
-- score under the new formula immediately, instead of only on their next
-- review.
DO $$
DECLARE uid uuid;
BEGIN
  FOR uid IN SELECT DISTINCT reviewed_user_id FROM public.reviews WHERE reviewed_user_id IS NOT NULL LOOP
    PERFORM public.fn_recalculate_review_trust(uid);
  END LOOP;
END $$;
