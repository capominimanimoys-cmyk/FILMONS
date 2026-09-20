-- FILMONS Portfolio View Notifications -- aggregated, race-condition-safe
-- "N people viewed your portfolio" notifications, reusing the existing
-- `notifications` table/UI rather than a parallel notification system.
--
-- Reused as-is (no schema change, no client code change): notifications.ts's
-- push()/getAll()/subscribe()/markRead()/markAllRead() and the whole
-- Notifications.tsx read/click/grouping UI. A "portfolio_view" notification
-- is a single row that GROWS IN PLACE (view_count incremented, title
-- rebuilt) as more people view the same unread batch, instead of one row
-- per viewer -- markRead() on that one row is all that's needed to close
-- the batch; the very next view then starts a fresh row.
--
-- Concurrency: a partial unique index on portfolio_view_batches(owner_id)
-- WHERE is_read = false means at most one unread batch can ever exist per
-- owner, enforced by Postgres itself -- fn_record_portfolio_view's
-- INSERT ... ON CONFLICT ... DO UPDATE is a single atomic statement, so N
-- simultaneous viewers all correctly land on unread_count = N, never N
-- separate "1 view" batches and never a lost increment.

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS view_count integer;

-- Analytics -- every valid view (owner excluded), independent of the
-- notification-batch dedup below. Lifetime/unique/time-windowed counts are
-- computed from this table directly (see getPortfolioViewStats); reading
-- the notification's own view_count would only ever show the CURRENT
-- unread batch, not lifetime totals.
CREATE TABLE IF NOT EXISTS public.portfolio_view_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid        NOT NULL,
  viewer_id   uuid        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS portfolio_view_events_owner_idx ON public.portfolio_view_events (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS portfolio_view_events_dedup_idx ON public.portfolio_view_events (owner_id, viewer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.portfolio_view_batches (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id            uuid        NOT NULL,
  unread_count        integer     NOT NULL DEFAULT 0,
  first_view_at       timestamptz NOT NULL DEFAULT now(),
  last_view_at        timestamptz NOT NULL DEFAULT now(),
  notification_id     uuid        REFERENCES public.notifications(id) ON DELETE SET NULL,
  is_read             boolean     NOT NULL DEFAULT false, -- mirrors notifications.is_read via trigger below
  last_email_sent_at  timestamptz,
  email_view_count     integer     NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now()
);
-- The concurrency guarantee: at most one unread batch per owner.
CREATE UNIQUE INDEX IF NOT EXISTS portfolio_view_batches_unread_owner_idx
  ON public.portfolio_view_batches (owner_id) WHERE is_read = false;

-- Keeps the batch's is_read in sync with its linked notification --
-- notifications.ts's existing markRead()/markAllRead() (unchanged, no new
-- client code needed) is what actually closes a batch. The NEXT view then
-- finds no unread batch for this owner (the partial index no longer
-- matches the now-read row) and starts a fresh one at count = 1.
CREATE OR REPLACE FUNCTION public.fn_sync_portfolio_view_batch_read()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.type = 'portfolio_view' AND NEW.is_read = true AND (OLD.is_read IS DISTINCT FROM true) THEN
    UPDATE public.portfolio_view_batches SET is_read = true WHERE notification_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_portfolio_view_batch_read ON public.notifications;
CREATE TRIGGER trg_sync_portfolio_view_batch_read
AFTER UPDATE OF is_read ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_portfolio_view_batch_read();

-- The one entry point the client/edge function calls. Does the whole
-- "record analytics + dedup + atomically grow-or-create the unread
-- notification batch + decide whether an email is due" sequence in one
-- transaction.
CREATE OR REPLACE FUNCTION public.fn_record_portfolio_view(p_viewer_id uuid, p_owner_id uuid)
RETURNS TABLE(unread_count integer, should_email boolean, notification_id uuid) LANGUAGE plpgsql AS $$
DECLARE
  v_deduped        boolean;
  v_batch          public.portfolio_view_batches%ROWTYPE;
  v_notif_id       uuid;
  v_should_email   boolean := false;
  v_title          text;
BEGIN
  IF p_viewer_id IS NULL OR p_owner_id IS NULL OR p_viewer_id = p_owner_id THEN
    RETURN QUERY SELECT 0, false, NULL::uuid;
    RETURN;
  END IF;

  -- Dedup window: the same viewer refreshing/re-entering within 12h counts
  -- once for notification purposes. Still logged as its own analytics
  -- event below either way (sessions/pageviews are a separate concern from
  -- "does this deserve a fresh notification").
  SELECT EXISTS(
    SELECT 1 FROM public.portfolio_view_events
    WHERE owner_id = p_owner_id AND viewer_id = p_viewer_id AND created_at > now() - interval '12 hours'
  ) INTO v_deduped;

  INSERT INTO public.portfolio_view_events (owner_id, viewer_id) VALUES (p_owner_id, p_viewer_id);

  IF v_deduped THEN
    RETURN QUERY SELECT 0, false, NULL::uuid;
    RETURN;
  END IF;

  -- Atomic grow-or-create -- the single statement that makes concurrent
  -- views safe (see this file's header comment).
  INSERT INTO public.portfolio_view_batches (owner_id, unread_count, first_view_at, last_view_at)
  VALUES (p_owner_id, 1, now(), now())
  ON CONFLICT (owner_id) WHERE is_read = false
  DO UPDATE SET unread_count = public.portfolio_view_batches.unread_count + 1, last_view_at = now()
  RETURNING * INTO v_batch;

  v_title := CASE WHEN v_batch.unread_count = 1 THEN 'Someone viewed your portfolio'
                  ELSE v_batch.unread_count || ' people viewed your portfolio' END;

  IF v_batch.notification_id IS NULL THEN
    INSERT INTO public.notifications (user_id, type, title, is_read, view_count)
    VALUES (p_owner_id, 'portfolio_view', v_title, false, v_batch.unread_count)
    RETURNING id INTO v_notif_id;
    UPDATE public.portfolio_view_batches SET notification_id = v_notif_id WHERE id = v_batch.id;
  ELSE
    v_notif_id := v_batch.notification_id;
    UPDATE public.notifications
      SET title = v_title, view_count = v_batch.unread_count, created_at = now()
      WHERE id = v_notif_id;
  END IF;

  -- Email rate-limit: at most once per hour per owner, claimed atomically
  -- here so two near-simultaneous views can't both decide to send. Fires
  -- immediately when due rather than a delayed cron batch -- matches how
  -- every other Filmons notification email already works (see
  -- messageNotification.ts's own note on why the old cron-delay approach
  -- was replaced).
  IF v_batch.last_email_sent_at IS NULL OR v_batch.last_email_sent_at < now() - interval '1 hour' THEN
    v_should_email := true;
    UPDATE public.portfolio_view_batches
      SET last_email_sent_at = now(), email_view_count = v_batch.unread_count
      WHERE id = v_batch.id;
  END IF;

  RETURN QUERY SELECT v_batch.unread_count, v_should_email, v_notif_id;
END;
$$;

ALTER TABLE public.portfolio_view_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_view_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "portfolio_view_events_all"  ON public.portfolio_view_events;
DROP POLICY IF EXISTS "portfolio_view_batches_all" ON public.portfolio_view_batches;
CREATE POLICY "portfolio_view_events_all"  ON public.portfolio_view_events  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "portfolio_view_batches_all" ON public.portfolio_view_batches FOR ALL USING (true) WITH CHECK (true);
