-- FILMONS Reliability Score / Trust Badge system.
--
-- Adds a NEW, independent composite score (Connections 45 + Recommendations 20
-- + Successful Transactions 20 + Identity Verification 15 = 100) stored under
-- filmons_* columns on the existing `reputation_scores` table. This is
-- deliberately additive, not a replacement of the pre-existing
-- reliability_score/reliability_level pair computed by
-- fn_recalculate_trust_score() (see 20240402000000_review_trust_score.sql,
-- weighted 40% reviews / 25% completed jobs / 15% cancellations / 5% disputes
-- / 5% account history) -- that function and its reviews-insert trigger are
-- left completely untouched so nothing that already reads reliability_score/
-- reliability_level breaks. New frontend code should read the filmons_*
-- columns instead.
--
-- CAVEATS (read before trusting these numbers blindly):
-- 1) Rentals: there is no confirmed "returned / fulfilled" terminal state in
--    this schema today -- rental_agreements only tracks the legal-agreement
--    lifecycle (draft/awaiting_verification/ready_to_sign/signed/cancelled/
--    superseded), and true payment/fulfillment truth lives on the untracked
--    (not schema-managed here) `orders` table whose exact column set can't be
--    safely assumed in a migration. We use rental_agreements.status='signed'
--    as a proxy for "a rental happened" -- it is NOT proof the rental was
--    actually returned/completed. Flagged as a fast-follow: once real
--    completion/return tracking exists, swap this proxy out.
-- 2) Buy/Sell: FILMONS has no live buy/sell marketplace purchase flow yet
--    (no dedicated table existed before this migration). `buy_sell_transactions`
--    is created here so the scoring formula has real, auditable schema from
--    day one, but it will score 0 for every user until an actual checkout
--    flow starts writing rows into it.

-- ── Connections ─────────────────────────────────────────────────────────────
-- A real, accepted, mutual professional relationship -- distinct from
-- Follow/Following (one-directional, no acceptance step, already covered by
-- the `follows` table). Canonical unordered pair: callers must always insert
-- with user_a_id < user_b_id (enforced below) so a pair can never be stored
-- twice in either direction.
CREATE TABLE IF NOT EXISTS public.professional_connections (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a_id     uuid        NOT NULL,
  user_b_id     uuid        NOT NULL,
  requested_by  uuid        NOT NULL,
  status        text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','removed')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  responded_at  timestamptz,
  CONSTRAINT professional_connections_ordered_pair CHECK (user_a_id < user_b_id),
  CONSTRAINT professional_connections_requester_is_party CHECK (requested_by = user_a_id OR requested_by = user_b_id),
  UNIQUE (user_a_id, user_b_id)
);
CREATE INDEX IF NOT EXISTS professional_connections_user_a_idx ON public.professional_connections (user_a_id, status);
CREATE INDEX IF NOT EXISTS professional_connections_user_b_idx ON public.professional_connections (user_b_id, status);

-- This app authenticates through its own `profiles` table rather than real
-- Supabase Auth sessions (auth.uid() is always null here), so RLS can't
-- distinguish requester/recipient -- access control is enforced in
-- application code, consistent with every other table this app writes from
-- the client (see identity_verifications, recommendations, etc.).
ALTER TABLE public.professional_connections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "professional_connections_all" ON public.professional_connections;
CREATE POLICY "professional_connections_all" ON public.professional_connections
  FOR ALL USING (true) WITH CHECK (true);

-- ── Buy/Sell transactions (schema-only until a real checkout flow exists) ──
CREATE TABLE IF NOT EXISTS public.buy_sell_transactions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id   text,
  order_id     text,
  buyer_id     uuid        NOT NULL,
  seller_id    uuid        NOT NULL,
  status       text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','completed','cancelled','refunded')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS buy_sell_transactions_buyer_idx  ON public.buy_sell_transactions (buyer_id, status);
CREATE INDEX IF NOT EXISTS buy_sell_transactions_seller_idx ON public.buy_sell_transactions (seller_id, status);

ALTER TABLE public.buy_sell_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "buy_sell_transactions_all" ON public.buy_sell_transactions;
CREATE POLICY "buy_sell_transactions_all" ON public.buy_sell_transactions
  FOR ALL USING (true) WITH CHECK (true);

-- ── New columns on reputation_scores ────────────────────────────────────────
ALTER TABLE public.reputation_scores
  ADD COLUMN IF NOT EXISTS filmons_reliability_score      numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS filmons_trust_level             text    NOT NULL DEFAULT 'new'
    CHECK (filmons_trust_level IN ('new','building_trust','reliable','trusted','elite')),
  ADD COLUMN IF NOT EXISTS filmons_connection_score        numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS filmons_recommendation_score    numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS filmons_transaction_score       numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS filmons_identity_score          numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS filmons_valid_connections       int     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS filmons_connections_elite       int     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS filmons_connections_trusted     int     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS filmons_connections_reliable    int     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS filmons_connections_building_new int    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS filmons_connections_creator      int    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS filmons_connections_creator_plus int    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS filmons_connections_professional int    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS filmons_connections_business     int    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS filmons_valid_recommendations    int    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS filmons_completed_rentals        int    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS filmons_completed_buy_sell       int    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS filmons_completed_paid_services  int    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS filmons_completed_paid_opportunities int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS filmons_identity_verified        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS filmons_score_updated_at         timestamptz;

-- ── Helpers ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_normalize_account_type(p_account_type text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_account_type IN ('creator_plus','service') THEN 'creator_plus'
    WHEN p_account_type = 'professional' THEN 'professional'
    WHEN p_account_type = 'business' THEN 'business'
    ELSE 'creator'
  END;
$$;

CREATE OR REPLACE FUNCTION public.fn_trust_level_bucket(p_trust_level text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_trust_level = 'elite' THEN 'elite'
    WHEN p_trust_level = 'trusted' THEN 'trusted'
    WHEN p_trust_level = 'reliable' THEN 'reliable'
    ELSE 'new_building'
  END;
$$;

-- Connection weight matrix, exactly per spec (New/Building share a column).
CREATE OR REPLACE FUNCTION public.fn_connection_weight(p_account_type text, p_trust_level text)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE public.fn_normalize_account_type(p_account_type)
    WHEN 'professional' THEN
      CASE public.fn_trust_level_bucket(p_trust_level)
        WHEN 'elite' THEN 0.75 WHEN 'trusted' THEN 0.65 WHEN 'reliable' THEN 0.50 ELSE 0.35 END
    WHEN 'business' THEN
      CASE public.fn_trust_level_bucket(p_trust_level)
        WHEN 'elite' THEN 0.75 WHEN 'trusted' THEN 0.65 WHEN 'reliable' THEN 0.50 ELSE 0.35 END
    WHEN 'creator_plus' THEN
      CASE public.fn_trust_level_bucket(p_trust_level)
        WHEN 'elite' THEN 0.60 WHEN 'trusted' THEN 0.50 WHEN 'reliable' THEN 0.40 ELSE 0.30 END
    ELSE -- creator
      CASE public.fn_trust_level_bucket(p_trust_level)
        WHEN 'elite' THEN 0.50 WHEN 'trusted' THEN 0.45 WHEN 'reliable' THEN 0.35 ELSE 0.25 END
  END;
$$;

-- ── Core recalculation ───────────────────────────────────────────────────────
-- Reads the CONNECTED user's already-stored filmons_trust_level (defaulting
-- 'new' when no row exists yet) rather than recomputing it live -- this is
-- what prevents the circular A-changes-B-changes-A recalculation loop the
-- spec warns about. A connected user's contribution only updates the next
-- time THIS function runs for the current user (triggered by one of the
-- qualifying events below), not synchronously when the other party's own
-- score changes.
CREATE OR REPLACE FUNCTION public.fn_recalculate_filmons_reliability(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_account_type text;
  v_is_verified boolean;
  v_connection_score numeric := 0;
  v_valid_connections int := 0;
  v_conn_elite int := 0; v_conn_trusted int := 0; v_conn_reliable int := 0; v_conn_building_new int := 0;
  v_conn_creator int := 0; v_conn_creator_plus int := 0; v_conn_professional int := 0; v_conn_business int := 0;
  v_recommendation_count int := 0;
  v_recommendation_score numeric := 0;
  v_rentals int := 0; v_buy_sell int := 0; v_paid_services int := 0; v_paid_opportunities int := 0;
  v_rental_score numeric := 0; v_buy_sell_score numeric := 0; v_paid_service_score numeric := 0; v_paid_opportunity_score numeric := 0;
  v_transaction_score numeric := 0;
  v_identity_score numeric := 0;
  v_reliability_score numeric := 0;
  v_trust_level text;
BEGIN
  SELECT account_type, is_verified INTO v_account_type, v_is_verified
  FROM public.profiles WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN; -- unknown user, nothing to score
  END IF;

  -- Connections (45 pts max) -- accepted, unique, real-user pairs only.
  SELECT
    coalesce(sum(public.fn_connection_weight(p2.account_type, coalesce(rs2.filmons_trust_level,'new'))), 0),
    count(*),
    count(*) FILTER (WHERE public.fn_trust_level_bucket(coalesce(rs2.filmons_trust_level,'new')) = 'elite'),
    count(*) FILTER (WHERE public.fn_trust_level_bucket(coalesce(rs2.filmons_trust_level,'new')) = 'trusted'),
    count(*) FILTER (WHERE public.fn_trust_level_bucket(coalesce(rs2.filmons_trust_level,'new')) = 'reliable'),
    count(*) FILTER (WHERE public.fn_trust_level_bucket(coalesce(rs2.filmons_trust_level,'new')) = 'new_building'),
    count(*) FILTER (WHERE public.fn_normalize_account_type(p2.account_type) = 'creator'),
    count(*) FILTER (WHERE public.fn_normalize_account_type(p2.account_type) = 'creator_plus'),
    count(*) FILTER (WHERE public.fn_normalize_account_type(p2.account_type) = 'professional'),
    count(*) FILTER (WHERE public.fn_normalize_account_type(p2.account_type) = 'business')
  INTO v_connection_score, v_valid_connections, v_conn_elite, v_conn_trusted, v_conn_reliable, v_conn_building_new,
       v_conn_creator, v_conn_creator_plus, v_conn_professional, v_conn_business
  FROM public.professional_connections pc
  JOIN public.profiles p2 ON p2.id = (CASE WHEN pc.user_a_id = p_user_id THEN pc.user_b_id ELSE pc.user_a_id END)
  LEFT JOIN public.reputation_scores rs2 ON rs2.user_id = p2.id
  WHERE pc.status = 'accepted' AND (pc.user_a_id = p_user_id OR pc.user_b_id = p_user_id) AND p2.id <> p_user_id;

  v_connection_score := least(coalesce(v_connection_score,0), 45);

  -- Recommendations (20 pts max) -- one active row per recommender already
  -- enforced by the recommendations.recommender_id/recipient_id UNIQUE
  -- constraint; exclude a stray self-recommendation defensively.
  SELECT count(*) INTO v_recommendation_count
  FROM public.recommendations WHERE recipient_id = p_user_id AND recommender_id <> p_user_id;
  v_recommendation_score := least((v_recommendation_count::numeric / 50) * 20, 20);

  -- Successful Transactions (20 pts max, 5 each) -- see file header caveats
  -- for the rentals proxy and buy/sell schema-only status.
  BEGIN
    SELECT count(*) INTO v_rentals
    FROM public.rental_agreements WHERE status = 'signed' AND (renter_id = p_user_id OR host_id = p_user_id);
  EXCEPTION WHEN undefined_table OR undefined_column THEN v_rentals := 0;
  END;
  v_rental_score := least((v_rentals::numeric / 25) * 5, 5);

  BEGIN
    SELECT count(*) INTO v_buy_sell
    FROM public.buy_sell_transactions WHERE status = 'completed' AND (buyer_id = p_user_id OR seller_id = p_user_id);
  EXCEPTION WHEN undefined_table OR undefined_column THEN v_buy_sell := 0;
  END;
  v_buy_sell_score := least((v_buy_sell::numeric / 10) * 5, 5);

  BEGIN
    SELECT count(*) INTO v_paid_services
    FROM public.hire_transactions WHERE work_status = 'completed' AND (host_id = p_user_id OR requester_id = p_user_id);
  EXCEPTION WHEN undefined_table OR undefined_column THEN v_paid_services := 0;
  END;
  v_paid_service_score := least(v_paid_services::numeric, 5);

  BEGIN
    SELECT count(*) INTO v_paid_opportunities
    FROM public.opportunity_transactions WHERE work_status = 'completed' AND (owner_id = p_user_id OR worker_id = p_user_id);
  EXCEPTION WHEN undefined_table OR undefined_column THEN v_paid_opportunities := 0;
  END;
  v_paid_opportunity_score := least((v_paid_opportunities::numeric / 10) * 5, 5);

  v_transaction_score := v_rental_score + v_buy_sell_score + v_paid_service_score + v_paid_opportunity_score;

  -- Identity Verification (15 pts, binary) -- never awarded for account type alone.
  v_identity_score := CASE WHEN v_is_verified THEN 15 ELSE 0 END;

  v_reliability_score := round(least(greatest(
    v_connection_score + v_recommendation_score + v_transaction_score + v_identity_score, 0), 100), 1);

  v_trust_level := CASE
    WHEN v_reliability_score < 20 THEN 'new'
    WHEN v_reliability_score < 40 THEN 'building_trust'
    WHEN v_reliability_score < 60 THEN 'reliable'
    WHEN v_reliability_score < 80 THEN 'trusted'
    ELSE 'elite'
  END;

  UPDATE public.reputation_scores SET
    account_type = coalesce(v_account_type, account_type),
    filmons_reliability_score = v_reliability_score,
    filmons_trust_level = v_trust_level,
    filmons_connection_score = v_connection_score,
    filmons_recommendation_score = v_recommendation_score,
    filmons_transaction_score = v_transaction_score,
    filmons_identity_score = v_identity_score,
    filmons_valid_connections = v_valid_connections,
    filmons_connections_elite = v_conn_elite,
    filmons_connections_trusted = v_conn_trusted,
    filmons_connections_reliable = v_conn_reliable,
    filmons_connections_building_new = v_conn_building_new,
    filmons_connections_creator = v_conn_creator,
    filmons_connections_creator_plus = v_conn_creator_plus,
    filmons_connections_professional = v_conn_professional,
    filmons_connections_business = v_conn_business,
    filmons_valid_recommendations = v_recommendation_count,
    filmons_completed_rentals = v_rentals,
    filmons_completed_buy_sell = v_buy_sell,
    filmons_completed_paid_services = v_paid_services,
    filmons_completed_paid_opportunities = v_paid_opportunities,
    filmons_identity_verified = coalesce(v_is_verified, false),
    filmons_score_updated_at = now()
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    INSERT INTO public.reputation_scores (
      user_id, account_type,
      filmons_reliability_score, filmons_trust_level, filmons_connection_score, filmons_recommendation_score,
      filmons_transaction_score, filmons_identity_score, filmons_valid_connections,
      filmons_connections_elite, filmons_connections_trusted, filmons_connections_reliable, filmons_connections_building_new,
      filmons_connections_creator, filmons_connections_creator_plus, filmons_connections_professional, filmons_connections_business,
      filmons_valid_recommendations, filmons_completed_rentals, filmons_completed_buy_sell,
      filmons_completed_paid_services, filmons_completed_paid_opportunities, filmons_identity_verified, filmons_score_updated_at
    ) VALUES (
      p_user_id, v_account_type,
      v_reliability_score, v_trust_level, v_connection_score, v_recommendation_score,
      v_transaction_score, v_identity_score, v_valid_connections,
      v_conn_elite, v_conn_trusted, v_conn_reliable, v_conn_building_new,
      v_conn_creator, v_conn_creator_plus, v_conn_professional, v_conn_business,
      v_recommendation_count, v_rentals, v_buy_sell, v_paid_services, v_paid_opportunities,
      coalesce(v_is_verified, false), now()
    );
  END IF;
END;
$$;

-- ── Trigger wiring: recalculate on every qualifying event ──────────────────
CREATE OR REPLACE FUNCTION public.trg_fn_connections_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.fn_recalculate_filmons_reliability(OLD.user_a_id);
    PERFORM public.fn_recalculate_filmons_reliability(OLD.user_b_id);
    RETURN OLD;
  ELSE
    PERFORM public.fn_recalculate_filmons_reliability(NEW.user_a_id);
    PERFORM public.fn_recalculate_filmons_reliability(NEW.user_b_id);
    RETURN NEW;
  END IF;
END;
$$;
DROP TRIGGER IF EXISTS trg_connections_recalc ON public.professional_connections;
CREATE TRIGGER trg_connections_recalc
  AFTER INSERT OR UPDATE OR DELETE ON public.professional_connections
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_connections_changed();

CREATE OR REPLACE FUNCTION public.trg_fn_recommendation_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.fn_recalculate_filmons_reliability(OLD.recipient_id);
    RETURN OLD;
  ELSE
    PERFORM public.fn_recalculate_filmons_reliability(NEW.recipient_id);
    RETURN NEW;
  END IF;
END;
$$;
DROP TRIGGER IF EXISTS trg_recommendations_recalc ON public.recommendations;
CREATE TRIGGER trg_recommendations_recalc
  AFTER INSERT OR DELETE ON public.recommendations
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_recommendation_changed();

CREATE OR REPLACE FUNCTION public.trg_fn_hire_completed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.work_status = 'completed' AND (TG_OP = 'INSERT' OR OLD.work_status IS DISTINCT FROM NEW.work_status) THEN
    PERFORM public.fn_recalculate_filmons_reliability(NEW.host_id);
    PERFORM public.fn_recalculate_filmons_reliability(NEW.requester_id);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_hire_recalc ON public.hire_transactions;
CREATE TRIGGER trg_hire_recalc
  AFTER INSERT OR UPDATE OF work_status ON public.hire_transactions
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_hire_completed();

CREATE OR REPLACE FUNCTION public.trg_fn_opportunity_completed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.work_status = 'completed' AND (TG_OP = 'INSERT' OR OLD.work_status IS DISTINCT FROM NEW.work_status) THEN
    PERFORM public.fn_recalculate_filmons_reliability(NEW.owner_id);
    PERFORM public.fn_recalculate_filmons_reliability(NEW.worker_id);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_opportunity_recalc ON public.opportunity_transactions;
CREATE TRIGGER trg_opportunity_recalc
  AFTER INSERT OR UPDATE OF work_status ON public.opportunity_transactions
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_opportunity_completed();

CREATE OR REPLACE FUNCTION public.trg_fn_rental_signed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.status = 'signed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM public.fn_recalculate_filmons_reliability(NEW.renter_id);
    IF NEW.host_id IS NOT NULL THEN
      PERFORM public.fn_recalculate_filmons_reliability(NEW.host_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_rental_recalc ON public.rental_agreements;
CREATE TRIGGER trg_rental_recalc
  AFTER INSERT OR UPDATE OF status ON public.rental_agreements
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_rental_signed();

CREATE OR REPLACE FUNCTION public.trg_fn_buy_sell_completed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.status = 'completed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM public.fn_recalculate_filmons_reliability(NEW.buyer_id);
    PERFORM public.fn_recalculate_filmons_reliability(NEW.seller_id);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_buy_sell_recalc ON public.buy_sell_transactions;
CREATE TRIGGER trg_buy_sell_recalc
  AFTER INSERT OR UPDATE OF status ON public.buy_sell_transactions
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_buy_sell_completed();

-- Column-specific trigger (`UPDATE OF is_verified`) so this does NOT fire on
-- every profiles write -- profiles.last_seen alone is updated every 2
-- minutes per active user (see AuthContext.tsx), and a table-wide AFTER
-- UPDATE trigger there would add real overhead across the whole user base.
CREATE OR REPLACE FUNCTION public.trg_fn_identity_verified_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF OLD.is_verified IS DISTINCT FROM NEW.is_verified THEN
    PERFORM public.fn_recalculate_filmons_reliability(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_identity_recalc ON public.profiles;
CREATE TRIGGER trg_identity_recalc
  AFTER UPDATE OF is_verified ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_identity_verified_changed();
