-- FILMONS Calendar: reminders, notification settings and calendar notifications.
--
-- Calendar entries themselves are NOT stored: they are derived live from the
-- source records (orders, rental-request messages, hire_requests,
-- opportunity_applications, live_session_applications, course_enrollments,
-- wallet_transactions, payout_requests), so a date/status change on the
-- original record can never leave a stale or duplicate calendar row behind.
-- What IS stored: the user's reminder choices (below) and, via the triggers
-- at the end, the notifications that announce an action + its calendar update.

-- ── 1. Reminders (scheduled + confirmed activities only) ─────────────────────
-- event_key is the stable key the client derives for an entry (e.g.
-- 'order:<id>:pickup'). remind_at/title/message are computed client-side and
-- refreshed whenever the calendar loads, so the cron job needs no knowledge of
-- the source tables. enabled=false is kept (not deleted) so automatic
-- reminders never switch back on something the user turned off.
CREATE TABLE IF NOT EXISTS public.calendar_reminders (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL,
  event_key     text        NOT NULL,
  remind_before text        NOT NULL CHECK (remind_before IN ('24h', '1h', 'day')),
  enabled       boolean     NOT NULL DEFAULT true,
  remind_at     timestamptz NOT NULL,
  start_at      timestamptz NOT NULL,
  title         text        NOT NULL,
  message       text        NOT NULL,
  link          text        NOT NULL DEFAULT '/calendar',
  sent_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, event_key, remind_before)
);
CREATE INDEX IF NOT EXISTS calendar_reminders_due_idx
  ON public.calendar_reminders (remind_at) WHERE sent_at IS NULL AND enabled;
CREATE INDEX IF NOT EXISTS calendar_reminders_user_idx ON public.calendar_reminders (user_id);

ALTER TABLE public.calendar_reminders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS calendar_reminders_all ON public.calendar_reminders;
-- Same app-wide open-RLS model as the other user-scoped tables (ownership is
-- enforced in code via user_id filters).
CREATE POLICY calendar_reminders_all ON public.calendar_reminders FOR ALL USING (true) WITH CHECK (true);

-- ── 2. Notification settings: user control over calendar notifications ───────
ALTER TABLE public.notification_settings ADD COLUMN IF NOT EXISTS notif_calendar_updates   boolean NOT NULL DEFAULT true;
ALTER TABLE public.notification_settings ADD COLUMN IF NOT EXISTS notif_calendar_reminders boolean NOT NULL DEFAULT true;

-- ── 3. Calendar notification helpers ─────────────────────────────────────────
-- Every trigger below is wrapped so that a notification problem can NEVER
-- block or roll back the booking / payment / enrollment write that fired it.
CREATE OR REPLACE FUNCTION public.fn_cal_day(p text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF p IS NULL OR p = '' THEN RETURN NULL; END IF;
  RETURN to_char(p::date, 'Mon FMDD, YYYY');
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.fn_cal_money(p_amount numeric, p_currency text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT '$' || to_char(coalesce(p_amount, 0), 'FM999999990.00') || ' ' || coalesce(nullif(p_currency, ''), 'CAD')
$$;

-- Inserts one calendar notification, honouring the recipient's setting.
-- p_token makes it idempotent (unique (user_id, type, message_id) index).
CREATE OR REPLACE FUNCTION public.fn_cal_notify(
  p_user text, p_title text, p_body text, p_key text, p_token text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_on boolean := true;
BEGIN
  IF p_user IS NULL OR p_user = '' THEN RETURN; END IF;
  BEGIN
    SELECT coalesce(notif_calendar_updates, true) INTO v_on
      FROM public.notification_settings WHERE user_id::text = p_user LIMIT 1;
  EXCEPTION WHEN OTHERS THEN v_on := true; END;
  IF v_on IS FALSE THEN RETURN; END IF;
  INSERT INTO public.notifications
    (user_id, actor_id, actor_name, type, title, body, entity_type, entity_id, message_id, is_read)
  VALUES
    (p_user, NULL, 'FILMONS Calendar', 'calendar_update', p_title, p_body, 'calendar', p_key, p_token, false)
  ON CONFLICT DO NOTHING;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ── 4. Orders: rental confirmed / service booked / purchase recorded,
--       rescheduled, cancelled (refunded) ───────────────────────────────────
-- Owners/sellers already get "Payment received" from the payment flow, so the
-- INSERT notice goes to the buyer/renter only (one notification per action).
CREATE OR REPLACE FUNCTION public.trg_calendar_orders() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  n jsonb := to_jsonb(NEW);
  o jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  typ text := n->>'type';
  t text := coalesce(n->>'listing_title', 'your booking');
  d_new text := public.fn_cal_day(n->>'start_date');
  d_old text := public.fn_cal_day(o->>'start_date');
  ev text; part text;
BEGIN
  BEGIN
    IF typ NOT IN ('rental', 'service', 'sale') THEN RETURN NEW; END IF;
    part := CASE typ WHEN 'rental' THEN 'pickup' WHEN 'service' THEN 'service' ELSE 'delivery' END;
    ev := 'order:' || (n->>'id') || ':' || CASE WHEN typ = 'sale' AND d_new IS NULL THEN 'sale' ELSE part END;

    IF TG_OP = 'INSERT' THEN
      IF typ = 'rental' THEN
        PERFORM public.fn_cal_notify(n->>'renter_id', 'Rental confirmed',
          CASE WHEN d_new IS NOT NULL THEN 'Your rental of ' || t || ' is confirmed for ' || d_new || '. Your calendar has been updated.'
               ELSE 'Your rental of ' || t || ' is confirmed. Your calendar has been updated.' END,
          ev, 'cal:' || ev || ':ins');
      ELSIF typ = 'service' THEN
        PERFORM public.fn_cal_notify(n->>'renter_id', 'Service added to your calendar',
          CASE WHEN d_new IS NOT NULL THEN 'Your booking for ' || t || ' with ' || coalesce(n->>'host_name', 'the provider') || ' is scheduled for ' || d_new || '.'
               ELSE 'Your booking for ' || t || ' with ' || coalesce(n->>'host_name', 'the provider') || ' is recorded on ' || coalesce(public.fn_cal_day(n->>'paid_at'), 'today') || '.' END,
          ev, 'cal:' || ev || ':ins');
      ELSE
        PERFORM public.fn_cal_notify(n->>'renter_id', 'Purchase recorded',
          'You purchased ' || t || ' for ' || public.fn_cal_money((n->>'total_amount')::numeric, n->>'currency') || '. The transaction is now in your calendar.',
          'order:' || (n->>'id') || ':sale', 'cal:order:' || (n->>'id') || ':sale:ins');
      END IF;
      RETURN NEW;
    END IF;

    -- UPDATE: refunded -> cancelled
    IF coalesce(n->>'refund_status', 'none') ~* 'refund' AND coalesce(o->>'refund_status', 'none') IS DISTINCT FROM coalesce(n->>'refund_status', 'none') THEN
      PERFORM public.fn_cal_notify(n->>'renter_id', 'Activity cancelled',
        t || ' on ' || coalesce(d_new, public.fn_cal_day(n->>'paid_at'), 'its date') || ' has been cancelled. Your calendar has been updated.',
        ev, 'cal:' || ev || ':cancel');
      PERFORM public.fn_cal_notify(n->>'host_id', 'Activity cancelled',
        t || ' on ' || coalesce(d_new, public.fn_cal_day(n->>'paid_at'), 'its date') || ' has been cancelled. Your calendar has been updated.',
        ev, 'cal:' || ev || ':cancel');
      RETURN NEW;
    END IF;

    -- UPDATE: date set / moved
    IF d_new IS NOT NULL AND d_new IS DISTINCT FROM d_old THEN
      IF d_old IS NULL THEN
        PERFORM public.fn_cal_notify(n->>'renter_id',
          CASE typ WHEN 'sale' THEN 'Your order date is confirmed' ELSE 'Calendar updated' END,
          CASE typ WHEN 'sale' THEN t || ' is scheduled for pickup / delivery on ' || d_new || '.'
                   ELSE t || ' is scheduled for ' || d_new || '. Your calendar has been updated.' END,
          ev, 'cal:' || ev || ':set:' || d_new);
        PERFORM public.fn_cal_notify(n->>'host_id',
          CASE typ WHEN 'sale' THEN 'Your order date is confirmed' ELSE 'Calendar updated' END,
          CASE typ WHEN 'sale' THEN t || ' is scheduled for pickup / delivery on ' || d_new || '.'
                   ELSE t || ' is scheduled for ' || d_new || '. Your calendar has been updated.' END,
          ev, 'cal:' || ev || ':set:' || d_new);
      ELSE
        PERFORM public.fn_cal_notify(n->>'renter_id', 'Calendar updated', t || ' moved from ' || d_old || ' to ' || d_new || '.', ev, 'cal:' || ev || ':mv:' || d_new);
        PERFORM public.fn_cal_notify(n->>'host_id',   'Calendar updated', t || ' moved from ' || d_old || ' to ' || d_new || '.', ev, 'cal:' || ev || ':mv:' || d_new);
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END $$;

DO $$ BEGIN
  IF to_regclass('public.orders') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS calendar_orders_ins ON public.orders;
    CREATE TRIGGER calendar_orders_ins AFTER INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.trg_calendar_orders();
    DROP TRIGGER IF EXISTS calendar_orders_upd ON public.orders;
    CREATE TRIGGER calendar_orders_upd AFTER UPDATE ON public.orders FOR EACH ROW
      WHEN (OLD.start_date IS DISTINCT FROM NEW.start_date OR OLD.refund_status IS DISTINCT FROM NEW.refund_status)
      EXECUTE FUNCTION public.trg_calendar_orders();
  END IF;
END $$;

-- ── 5. Rental / service request sent (requester gets the calendar notice;
--       the owner already gets "sent a rental request") ─────────────────────
CREATE OR REPLACE FUNCTION public.trg_calendar_requests() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  rr jsonb := to_jsonb(NEW)->'metadata'->'rentalRequest';
  rr_old jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD)->'metadata'->'rentalRequest' ELSE NULL END;
  d text; t text; is_service boolean; ev text;
BEGIN
  BEGIN
    IF rr IS NULL OR jsonb_typeof(rr) <> 'object' THEN RETURN NEW; END IF;
    IF coalesce(rr->>'durationType', '') = 'purchase' OR coalesce(rr->>'listingMode', '') = 'sale' THEN RETURN NEW; END IF;
    d := public.fn_cal_day(rr->>'startDate');
    IF d IS NULL THEN RETURN NEW; END IF;
    t := coalesce(rr->>'listingTitle', 'your request');
    is_service := coalesce(rr->>'listingType', '') = 'service';
    ev := 'req:' || (to_jsonb(NEW)->>'id') || ':' || CASE WHEN is_service OR rr->>'durationType' = 'hours' THEN 'service' ELSE 'pickup' END;

    IF TG_OP = 'INSERT' THEN
      PERFORM public.fn_cal_notify(to_jsonb(NEW)->>'sender_id',
        CASE WHEN is_service THEN 'Service added to your calendar' ELSE 'Rental added to your calendar' END,
        CASE WHEN is_service THEN 'Your booking request for ' || t || ' on ' || d || ' is pending confirmation.'
             ELSE 'Your request for ' || t || ' on ' || d || ' is pending confirmation.' END,
        ev, 'cal:' || ev || ':ins');
    ELSIF coalesce(rr->>'status', '') = 'declined' AND coalesce(rr_old->>'status', '') <> 'declined' THEN
      PERFORM public.fn_cal_notify(to_jsonb(NEW)->>'sender_id', 'Activity cancelled',
        t || ' on ' || d || ' has been cancelled. Your calendar has been updated.', ev, 'cal:' || ev || ':cancel');
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END $$;

DO $$ BEGIN
  IF to_regclass('public.messages') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS calendar_requests_ins ON public.messages;
    CREATE TRIGGER calendar_requests_ins AFTER INSERT ON public.messages FOR EACH ROW
      WHEN (NEW.type = 'rental_request') EXECUTE FUNCTION public.trg_calendar_requests();
    DROP TRIGGER IF EXISTS calendar_requests_upd ON public.messages;
    CREATE TRIGGER calendar_requests_upd AFTER UPDATE OF metadata ON public.messages FOR EACH ROW
      WHEN (NEW.type = 'rental_request') EXECUTE FUNCTION public.trg_calendar_requests();
  END IF;
END $$;

-- ── 6. Service bookings through hire requests ────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_calendar_hire() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  n jsonb := to_jsonb(NEW);
  o jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  t text := coalesce(n->>'project_title', n->>'service_label', 'your service');
  d_new text := public.fn_cal_day(n->>'start_date');
  d_old text := public.fn_cal_day(o->>'start_date');
  when_txt text; host_name text; req_name text; ev text := 'hire:' || (n->>'id') || ':service';
BEGIN
  BEGIN
    IF d_new IS NULL AND d_old IS NULL THEN RETURN NEW; END IF;
    SELECT name INTO host_name FROM public.profiles WHERE id::text = n->>'host_id';
    SELECT name INTO req_name  FROM public.profiles WHERE id::text = n->>'requester_id';
    when_txt := coalesce(d_new, d_old) || CASE WHEN coalesce(n->>'start_time', '') <> '' THEN ' at ' || (n->>'start_time') ELSE '' END;

    IF TG_OP = 'INSERT' THEN
      PERFORM public.fn_cal_notify(n->>'requester_id', 'Service added to your calendar',
        'Your booking request for ' || t || ' with ' || coalesce(host_name, 'the provider') || ' is pending for ' || when_txt || '.',
        ev, 'cal:' || ev || ':ins');
      RETURN NEW;
    END IF;

    IF n->>'status' = 'hired' AND o->>'status' IS DISTINCT FROM 'hired' THEN
      PERFORM public.fn_cal_notify(n->>'requester_id', 'Service added to your calendar',
        'Your booking for ' || t || ' with ' || coalesce(host_name, 'the provider') || ' is scheduled for ' || when_txt || '.',
        ev, 'cal:' || ev || ':hired');
      PERFORM public.fn_cal_notify(n->>'host_id', 'Service added to your calendar',
        coalesce(req_name, 'A client') || ' booked your ' || t || ' for ' || when_txt || '.',
        ev, 'cal:' || ev || ':hired');
    ELSIF n->>'status' IN ('declined', 'cancelled', 'expired') AND o->>'status' IS DISTINCT FROM n->>'status' THEN
      PERFORM public.fn_cal_notify(n->>'requester_id', 'Activity cancelled', t || ' on ' || when_txt || ' has been cancelled. Your calendar has been updated.', ev, 'cal:' || ev || ':cancel');
      PERFORM public.fn_cal_notify(n->>'host_id',      'Activity cancelled', t || ' on ' || when_txt || ' has been cancelled. Your calendar has been updated.', ev, 'cal:' || ev || ':cancel');
    ELSIF d_new IS NOT NULL AND d_old IS NOT NULL AND d_new IS DISTINCT FROM d_old THEN
      PERFORM public.fn_cal_notify(n->>'requester_id', 'Calendar updated', t || ' moved from ' || d_old || ' to ' || d_new || '.', ev, 'cal:' || ev || ':mv:' || d_new);
      PERFORM public.fn_cal_notify(n->>'host_id',      'Calendar updated', t || ' moved from ' || d_old || ' to ' || d_new || '.', ev, 'cal:' || ev || ':mv:' || d_new);
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END $$;

DO $$ BEGIN
  IF to_regclass('public.hire_requests') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS calendar_hire_ins ON public.hire_requests;
    CREATE TRIGGER calendar_hire_ins AFTER INSERT ON public.hire_requests FOR EACH ROW EXECUTE FUNCTION public.trg_calendar_hire();
    DROP TRIGGER IF EXISTS calendar_hire_upd ON public.hire_requests;
    CREATE TRIGGER calendar_hire_upd AFTER UPDATE ON public.hire_requests FOR EACH ROW
      WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.start_date IS DISTINCT FROM NEW.start_date)
      EXECUTE FUNCTION public.trg_calendar_hire();
  END IF;
END $$;

-- ── 7. Opportunity applications: recorded + work date moved ──────────────────
-- Accept / decline / withdraw already notify the people involved
-- (application_accepted / _rejected / _withdrawn), so only the new
-- application and a changed work date are announced here.
CREATE OR REPLACE FUNCTION public.trg_calendar_applications() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  n jsonb := to_jsonb(NEW);
  o jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  l_title text; l_meta jsonb; l_owner text; d_new text; d_old text; ev text := 'opp:' || (n->>'id') || ':work';
BEGIN
  BEGIN
    SELECT title, metadata, user_id::text INTO l_title, l_meta, l_owner FROM public.listings WHERE id::text = n->>'listing_id';
    l_title := coalesce(l_title, 'the opportunity');
    d_new := public.fn_cal_day(coalesce(n->'accepted_details'->>'startDate', l_meta->'opportunity'->>'startDate'));

    IF TG_OP = 'INSERT' THEN
      PERFORM public.fn_cal_notify(n->>'applicant_id', 'Application recorded',
        'You applied to ' || l_title || '.' || CASE WHEN d_new IS NOT NULL THEN ' The work date appears in your calendar as pending.' ELSE '' END,
        'opp:' || (n->>'id') || ':applied', 'cal:opp:' || (n->>'id') || ':applied');
      RETURN NEW;
    END IF;

    d_old := public.fn_cal_day(coalesce(o->'accepted_details'->>'startDate', l_meta->'opportunity'->>'startDate'));
    IF d_new IS NOT NULL AND d_old IS NOT NULL AND d_new IS DISTINCT FROM d_old THEN
      PERFORM public.fn_cal_notify(n->>'applicant_id', 'Calendar updated', l_title || ' moved from ' || d_old || ' to ' || d_new || '.', ev, 'cal:' || ev || ':mv:' || d_new);
      PERFORM public.fn_cal_notify(coalesce(n->>'owner_id', l_owner), 'Calendar updated', l_title || ' moved from ' || d_old || ' to ' || d_new || '.', ev, 'cal:' || ev || ':mv:' || d_new);
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END $$;

DO $$ BEGIN
  IF to_regclass('public.opportunity_applications') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS calendar_apps_ins ON public.opportunity_applications;
    CREATE TRIGGER calendar_apps_ins AFTER INSERT ON public.opportunity_applications FOR EACH ROW EXECUTE FUNCTION public.trg_calendar_applications();
    DROP TRIGGER IF EXISTS calendar_apps_upd ON public.opportunity_applications;
    CREATE TRIGGER calendar_apps_upd AFTER UPDATE ON public.opportunity_applications FOR EACH ROW
      WHEN (OLD.accepted_details IS DISTINCT FROM NEW.accepted_details)
      EXECUTE FUNCTION public.trg_calendar_applications();
  END IF;
END $$;

-- ── 8. Live sessions: scheduled / moved / cancelled ──────────────────────────
CREATE OR REPLACE FUNCTION public.trg_calendar_live() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  n jsonb := to_jsonb(NEW);
  o jsonb := to_jsonb(OLD);
  s_title text; s_instr text; s_tz text; instr_name text; learner_name text;
  w_new text; w_old text; ev text := 'live:' || (n->>'id') || ':session';
BEGIN
  BEGIN
    SELECT title, instructor_id::text, coalesce(timezone, 'UTC') INTO s_title, s_instr, s_tz FROM public.live_sessions WHERE id::text = n->>'session_id';
    s_title := coalesce(s_title, 'Your live session');
    SELECT name INTO instr_name   FROM public.profiles WHERE id::text = s_instr;
    SELECT name INTO learner_name FROM public.profiles WHERE id::text = n->>'student_id';
    IF n->>'scheduled_at' IS NOT NULL THEN
      w_new := to_char((n->>'scheduled_at')::timestamptz AT TIME ZONE s_tz, 'Mon FMDD, YYYY "at" FMHH12:MI AM') || ' (' || s_tz || ')';
    END IF;
    IF o->>'scheduled_at' IS NOT NULL THEN
      w_old := to_char((o->>'scheduled_at')::timestamptz AT TIME ZONE s_tz, 'Mon FMDD, YYYY "at" FMHH12:MI AM');
    END IF;

    IF n->>'status' = 'confirmed' AND o->>'status' IS DISTINCT FROM 'confirmed' AND w_new IS NOT NULL THEN
      PERFORM public.fn_cal_notify(n->>'student_id', 'Live session scheduled',
        s_title || ' with ' || coalesce(instr_name, 'your instructor') || ' is scheduled for ' || w_new || '.', ev, 'cal:' || ev || ':conf');
      PERFORM public.fn_cal_notify(s_instr, 'Live session scheduled',
        coalesce(learner_name, 'A learner') || ' booked ' || s_title || ' for ' || w_new || '.', ev, 'cal:' || ev || ':conf');
    ELSIF n->>'status' = 'cancelled' AND o->>'status' IS DISTINCT FROM 'cancelled' AND w_new IS NOT NULL THEN
      PERFORM public.fn_cal_notify(n->>'student_id', 'Activity cancelled', s_title || ' on ' || w_new || ' has been cancelled. Your calendar has been updated.', ev, 'cal:' || ev || ':cancel');
      PERFORM public.fn_cal_notify(s_instr,          'Activity cancelled', s_title || ' on ' || w_new || ' has been cancelled. Your calendar has been updated.', ev, 'cal:' || ev || ':cancel');
    ELSIF n->>'status' = 'confirmed' AND w_old IS NOT NULL AND w_new IS NOT NULL AND (n->>'scheduled_at') IS DISTINCT FROM (o->>'scheduled_at') THEN
      PERFORM public.fn_cal_notify(n->>'student_id', 'Calendar updated', s_title || ' moved from ' || w_old || ' to ' || w_new || '.', ev, 'cal:' || ev || ':mv:' || (n->>'scheduled_at'));
      PERFORM public.fn_cal_notify(s_instr,          'Calendar updated', s_title || ' moved from ' || w_old || ' to ' || w_new || '.', ev, 'cal:' || ev || ':mv:' || (n->>'scheduled_at'));
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END $$;

DO $$ BEGIN
  IF to_regclass('public.live_session_applications') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS calendar_live_upd ON public.live_session_applications;
    CREATE TRIGGER calendar_live_upd AFTER UPDATE ON public.live_session_applications FOR EACH ROW
      WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.scheduled_at IS DISTINCT FROM NEW.scheduled_at)
      EXECUTE FUNCTION public.trg_calendar_live();
  END IF;
END $$;

-- ── 9. Course enrollment recorded ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_calendar_enrollment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n jsonb := to_jsonb(NEW); c_title text;
BEGIN
  BEGIN
    SELECT title INTO c_title FROM public.courses WHERE id::text = n->>'course_id';
    PERFORM public.fn_cal_notify(n->>'user_id', 'Course added to your calendar',
      'You enrolled in ' || coalesce(c_title, 'your course') || '. Your enrollment is recorded on ' ||
        coalesce(to_char((n->>'enrolled_at')::timestamptz, 'Mon FMDD, YYYY'), 'today') || '.',
      'course:' || (n->>'id') || ':enrolled', 'cal:course:' || (n->>'id') || ':enrolled');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END $$;

DO $$ BEGIN
  IF to_regclass('public.course_enrollments') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS calendar_enrollment_ins ON public.course_enrollments;
    CREATE TRIGGER calendar_enrollment_ins AFTER INSERT ON public.course_enrollments FOR EACH ROW EXECUTE FUNCTION public.trg_calendar_enrollment();
  END IF;
END $$;

-- ── 10. Wallet cash in -- PRIVATE: only ever sent to the wallet's owner ───────
-- Fires when funds become AVAILABLE (the "on hold" notice is sent separately by
-- the payment flow). Cash-out requests/completions/failures already notify via
-- payout_requested / payout_paid / payout_failed / payout_rejected, so they are
-- not duplicated here.
CREATE OR REPLACE FUNCTION public.trg_calendar_wallet_in() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n jsonb := to_jsonb(NEW); o jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END; w_owner text;
BEGIN
  BEGIN
    IF (n->>'amount')::numeric <= 0 THEN RETURN NEW; END IF;
    IF n->>'transaction_type' NOT IN ('rental_earning', 'service_earning', 'sale_earning', 'opportunity_earning', 'hire_earning', 'adjustment') THEN RETURN NEW; END IF;
    IF NOT (n->>'balance_type' = 'available' OR n->>'status' = 'available') THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' AND (o->>'balance_type' = 'available' OR o->>'status' = 'available') THEN RETURN NEW; END IF; -- already announced
    SELECT owner_id::text INTO w_owner FROM public.wallets WHERE id::text = n->>'wallet_id' AND owner_type = 'host';
    IF w_owner IS NULL THEN RETURN NEW; END IF;
    PERFORM public.fn_cal_notify(w_owner, 'Funds added',
      public.fn_cal_money((n->>'amount')::numeric, n->>'currency') || ' was added to your FILMONS wallet. The transaction is recorded in your calendar.',
      'wallet:in:' || (n->>'id'), 'cal:wallet:in:' || (n->>'id'));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END $$;

DO $$ BEGIN
  IF to_regclass('public.wallet_transactions') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS calendar_wallet_in_ins ON public.wallet_transactions;
    CREATE TRIGGER calendar_wallet_in_ins AFTER INSERT ON public.wallet_transactions FOR EACH ROW EXECUTE FUNCTION public.trg_calendar_wallet_in();
    DROP TRIGGER IF EXISTS calendar_wallet_in_upd ON public.wallet_transactions;
    CREATE TRIGGER calendar_wallet_in_upd AFTER UPDATE ON public.wallet_transactions FOR EACH ROW
      WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.balance_type IS DISTINCT FROM NEW.balance_type)
      EXECUTE FUNCTION public.trg_calendar_wallet_in();
  END IF;
END $$;
