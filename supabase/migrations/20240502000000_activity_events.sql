-- Connect -> Activity: real network-activity events. Never a generic
-- "posts" table -- each row is a typed, resource-linked event (see
-- activity_type below). Visibility is NOT enforced by RLS here (this app
-- has no working per-row auth, see identity_verifications' own comment on
-- this same pattern) -- it's enforced by the READ path in activityApi.ts,
-- which re-verifies every referenced resource is STILL public at query
-- time (not just at the moment the event was logged), so a later
-- hide/delete/privacy change on the underlying resource makes its Activity
-- entry stop appearing without needing to touch this table at all.
CREATE TABLE IF NOT EXISTS public.activity_events (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id      uuid        NOT NULL,
  -- The other party for a two-person event (connection_created's other
  -- connected user, recommendation_received's recommender). Null otherwise.
  other_user_id uuid,
  activity_type text        NOT NULL CHECK (activity_type IN (
    'portfolio_published', 'portfolio_album_published', 'service_published',
    'opportunity_published', 'listing_published', 'connection_created', 'recommendation_received'
  )),
  target_type   text,   -- 'portfolio_item' | 'portfolio_album' | 'listing' | 'connection' | 'recommendation'
  target_id     text,
  category      text,   -- creative taxonomy category, when the underlying resource has one
  subcategory   text,
  title         text,   -- cached display title (e.g. listing/portfolio item title) -- display-only, never trusted over a live visibility check
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activity_events_actor_idx   ON public.activity_events (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_events_created_idx ON public.activity_events (created_at DESC);

ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "activity_events_all" ON public.activity_events;
CREATE POLICY "activity_events_all" ON public.activity_events
  FOR ALL USING (true) WITH CHECK (true);

-- ── connection_created -- logged server-side (not client-side) since a
-- connection becoming 'accepted' can happen from either party's client,
-- and this guarantees exactly one pair of events regardless of which side
-- triggered it. One row per direction so each connected user's followers
-- see it attributed to whichever of the two they actually follow.
CREATE OR REPLACE FUNCTION public.trg_fn_log_connection_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.status = 'accepted' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO public.activity_events (actor_id, other_user_id, activity_type, target_type, target_id)
    VALUES (NEW.user_a_id, NEW.user_b_id, 'connection_created', 'connection', NEW.id::text);
    INSERT INTO public.activity_events (actor_id, other_user_id, activity_type, target_type, target_id)
    VALUES (NEW.user_b_id, NEW.user_a_id, 'connection_created', 'connection', NEW.id::text);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_connection_activity ON public.professional_connections;
CREATE TRIGGER trg_connection_activity
  AFTER INSERT OR UPDATE OF status ON public.professional_connections
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_log_connection_activity();

-- ── recommendation_received -- attributed to the RECIPIENT (the sentence
-- is about them: "X received a new professional recommendation"), not the
-- recommender. Row-level AFTER INSERT naturally fires only for a genuinely
-- NEW recommendation -- createOrUpdateRecommendation's upsert resolves an
-- edit of an existing one as an UPDATE, which this trigger doesn't listen
-- to, so editing your own recommendation never re-logs an event.
CREATE OR REPLACE FUNCTION public.trg_fn_log_recommendation_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.activity_events (actor_id, other_user_id, activity_type, target_type, target_id)
  VALUES (NEW.recipient_id, NEW.recommender_id, 'recommendation_received', 'recommendation', NEW.id::text);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_recommendation_activity ON public.recommendations;
CREATE TRIGGER trg_recommendation_activity
  AFTER INSERT ON public.recommendations
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_log_recommendation_activity();
