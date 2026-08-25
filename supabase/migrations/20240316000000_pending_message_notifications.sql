-- Replaces the old client-side setTimeout(5min)-scheduled "new message"
-- email (messageNotification.ts) with a real server-side delayed send.
-- The setTimeout approach only fired if the SENDER kept their browser tab
-- open and idle for the full 5 minutes -- closing the tab, navigating away,
-- or the mobile browser backgrounding it lost the timer entirely, so the
-- recipient's email silently never went out. This table is written to
-- immediately when a message is sent (survives the sender doing anything
-- afterward); a cron-driven edge function (send-message-notifications)
-- picks up due, still-unsent rows on a 5-minute schedule.
CREATE TABLE IF NOT EXISTS public.pending_message_notifications (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id        text NOT NULL,
  conversation_id   text NOT NULL,
  receiver_id       uuid NOT NULL,
  sender_id         uuid NOT NULL,
  sender_name       text NOT NULL,
  message_preview   text NOT NULL,
  kind              text NOT NULL DEFAULT 'direct',
  listing_title     text,
  listing_id        text,
  send_after        timestamptz NOT NULL,
  sent_at           timestamptz,   -- set when the email actually went out
  skipped_at        timestamptz,   -- set when due but correctly not sent (online, rate-limited, disabled)
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pending_msg_notif_due
  ON public.pending_message_notifications(send_after)
  WHERE sent_at IS NULL AND skipped_at IS NULL;

-- Rate-limit lookup: "was an email already sent for this receiver+
-- conversation in the last hour" (replaces the old localStorage anti-spam
-- guard, which obviously can't survive server-side).
CREATE INDEX IF NOT EXISTS idx_pending_msg_notif_rate_limit
  ON public.pending_message_notifications(receiver_id, conversation_id, sent_at)
  WHERE sent_at IS NOT NULL;

ALTER TABLE public.pending_message_notifications ENABLE ROW LEVEL SECURITY;

-- Client inserts a row the moment a message is sent -- same "anon/
-- authenticated can insert, ownership isn't DB-enforced" convention as
-- notifications (notifs_insert). Only the cron edge function (service
-- role, bypasses RLS) ever reads or updates rows, so no SELECT/UPDATE
-- policy is needed.
DROP POLICY IF EXISTS pending_msg_notif_insert ON public.pending_message_notifications;
CREATE POLICY pending_msg_notif_insert ON public.pending_message_notifications FOR INSERT WITH CHECK (true);
