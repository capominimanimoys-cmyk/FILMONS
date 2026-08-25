-- Real read/unread persistence for messages and notifications.
--
-- Messages: `metadata.read` was set to false on insert and never updated
-- anywhere in the codebase (markAsRead only wrote to localStorage and
-- fired-and-forgot a legacy /conversations/:id/read endpoint backed by
-- conversation_participants, which has zero rows in production). Every
-- message has therefore always reported as unread forever, and the "seen"
-- checkmark (getMessageStatuses) read from another dead legacy endpoint.
-- read_at is the real, queryable source of truth going forward.
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS read_at timestamptz;

-- Fast "how many unread messages does user X have in conversation Y" /
-- "mark all unread messages from the other participant as read" queries.
CREATE INDEX IF NOT EXISTS idx_messages_conv_sender_unread
  ON public.messages(conversation_id, sender_id)
  WHERE read_at IS NULL;

-- Notifications already had is_read; adding read_at alongside it (kept as
-- a separate boolean, not replaced -- is_read is still the fast filter,
-- read_at is when).
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS read_at timestamptz;

-- Dedup guard for status-change notifications the same way
-- idx_notifications_review_dedup / idx_notifications_message_dedup already
-- guard reviews/messages: pushNotification() in manage-application has no
-- idempotency of its own, so a repeated action on a non-terminal status
-- (shortlist can legitimately be called again before a terminal
-- transition -- confirmed live, this session's own repeated testing did
-- exactly that) would otherwise insert a second identical notification.
--
-- Keyed on application_id, not conversation_id -- one conversation is
-- reused for every application between the same two users (established
-- convention), so a conversation-scoped key would block a genuinely
-- different, later application's first "shortlisted" notification just
-- because an earlier application in the same conversation already used
-- that slot. application_id makes the dedup exact to the one transition
-- it's actually guarding.
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS application_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_application_dedup
  ON public.notifications(user_id, type, application_id)
  WHERE type IN ('application_shortlisted', 'application_accepted', 'application_rejected', 'application_withdrawn')
    AND application_id IS NOT NULL;

-- Safety net: messages/notifications realtime INSERT already demonstrably
-- fires in production, meaning both are already publication members
-- (confirmed working features), so this is very likely a no-op -- but
-- unlike 20240317000000's tables, that was never actually verified for
-- these two, and the guard costs nothing if it turns out to already be a
-- member.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;
