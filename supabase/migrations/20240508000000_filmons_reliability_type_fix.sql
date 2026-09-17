-- Fixes a real bug in fn_recalculate_filmons_reliability()
-- (20240501000000_filmons_reliability_system.sql): it compares
-- professional_connections.user_a_id/user_b_id (declared uuid in that
-- migration) and the p_user_id uuid parameter directly against
-- public.profiles.id and public.reputation_scores.user_id -- which are
-- actually `text` columns in this live database (this app doesn't use
-- real Supabase Auth / auth.users, so profiles.id was never a uuid
-- column to begin with). Postgres has no `=` operator for text/uuid, so
-- EVERY call to this function errored ("operator does not exist: text =
-- uuid") the moment it reached the connections JOIN or the final UPDATE/
-- INSERT into reputation_scores -- which is why an already-verified
-- account's Trust Score stayed 0 with no way to ever recalculate: every
-- trigger that was supposed to fix it (a new connection, a completed
-- transaction, the is_verified UPDATE trigger) silently failed the same
-- way.
--
-- Fix: normalize every id to ::text at each comparison/write against
-- profiles/reputation_scores, rather than assuming either side's exact
-- column type -- text::text is a no-op and uuid::text always succeeds,
-- so this is safe regardless of which columns truly are which type.
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
  FROM public.profiles WHERE id::text = p_user_id::text;

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
  JOIN public.profiles p2 ON p2.id::text = (CASE WHEN pc.user_a_id = p_user_id THEN pc.user_b_id ELSE pc.user_a_id END)::text
  LEFT JOIN public.reputation_scores rs2 ON rs2.user_id::text = p2.id::text
  WHERE pc.status = 'accepted' AND (pc.user_a_id = p_user_id OR pc.user_b_id = p_user_id) AND p2.id::text <> p_user_id::text;

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
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN v_rentals := 0;
  END;
  v_rental_score := least((v_rentals::numeric / 25) * 5, 5);

  BEGIN
    SELECT count(*) INTO v_buy_sell
    FROM public.buy_sell_transactions WHERE status = 'completed' AND (buyer_id = p_user_id OR seller_id = p_user_id);
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN v_buy_sell := 0;
  END;
  v_buy_sell_score := least((v_buy_sell::numeric / 10) * 5, 5);

  BEGIN
    SELECT count(*) INTO v_paid_services
    FROM public.hire_transactions WHERE work_status = 'completed' AND (host_id = p_user_id OR requester_id = p_user_id);
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN v_paid_services := 0;
  END;
  v_paid_service_score := least(v_paid_services::numeric, 5);

  BEGIN
    SELECT count(*) INTO v_paid_opportunities
    FROM public.opportunity_transactions WHERE work_status = 'completed' AND (owner_id = p_user_id OR worker_id = p_user_id);
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN v_paid_opportunities := 0;
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
  WHERE user_id::text = p_user_id::text;

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
      p_user_id::text, v_account_type,
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

-- Re-run the backfill now that the function actually works end-to-end --
-- 20240507000000's own backfill call hit this same bug for every user,
-- so nobody's score was actually populated by it. Each row is wrapped in
-- its own BEGIN/EXCEPTION so one malformed/non-uuid-formatted profile id
-- (if any exist) can't abort the whole backfill for everyone else.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.profiles LOOP
    BEGIN
      PERFORM public.fn_recalculate_filmons_reliability(r.id::uuid);
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Skipped profile % during reliability backfill: %', r.id, SQLERRM;
    END;
  END LOOP;
END $$;
