-- The new desktop Connect RecommendationActivityCard shows the actual
-- recommendation quote and the recommender's role at time of writing --
-- neither was cached on the recommendation_received event before this.
-- CREATE OR REPLACE is safe to redefine; the trigger itself is unchanged,
-- only what it writes.
CREATE OR REPLACE FUNCTION public.trg_fn_log_recommendation_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.activity_events (actor_id, other_user_id, activity_type, target_type, target_id, title, metadata)
  VALUES (
    NEW.recipient_id, NEW.recommender_id, 'recommendation_received', 'recommendation', NEW.id::text,
    left(NEW.body, 240),
    jsonb_build_object('roleSnapshot', NEW.role_snapshot)
  );
  RETURN NEW;
END;
$$;
