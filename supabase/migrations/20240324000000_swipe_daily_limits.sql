-- Daily Like/Pass swipe limits (Creator 10/day, Creator+ 25/day,
-- Professional/Business unlimited). Same race-safe count-then-insert
-- pattern as fn_submit_opportunity_application
-- (20240302000000_opportunity_entitlements_and_subscriptions.sql):
-- pg_advisory_xact_lock keyed on user+day, p_limit resolved by the caller
-- (record-swipe edge function) from the one canonical entitlements table
-- in supabase/functions/_shared/entitlements.ts -- this function stays
-- generic and never re-derives tier logic itself. p_limit = NULL means
-- unlimited. "See Listing" never calls this at all, so it never counts.
--
-- Day boundary is UTC (date_trunc('day', now())) -- Filmons has no stored
-- per-user timezone anywhere, so a fabricated one would be worse than a
-- consistent UTC day for every account.
CREATE OR REPLACE FUNCTION fn_record_swipe(
  p_user_id uuid, p_item_id text, p_item_type text, p_direction text, p_limit integer
) RETURNS public.swipes AS $$
DECLARE
  v_count integer;
  v_row public.swipes;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text || to_char(now(), 'YYYY-MM-DD') || ':swipe'));
  IF p_limit IS NOT NULL THEN
    SELECT count(*) INTO v_count FROM public.swipes
      WHERE user_id = p_user_id AND created_at >= date_trunc('day', now());
    IF v_count >= p_limit THEN
      RAISE EXCEPTION 'limit_reached' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  INSERT INTO public.swipes (user_id, item_id, item_type, direction)
    VALUES (p_user_id, p_item_id, p_item_type, p_direction)
    RETURNING * INTO v_row;
  RETURN v_row;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;
