-- Idempotency for message notifications. push() in src/app/lib/notifications.ts
-- previously excluded message-type notifications from its dedup entirely
-- (relying only on the sender never notifying themselves) — a realtime
-- reconnect or a retried send could create more than one notification row
-- for the same message. This adds the actual constraint the app writes
-- against: at most one notification per (recipient, type, message).
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS message_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_message_dedup
  ON public.notifications (user_id, type, message_id)
  WHERE message_id IS NOT NULL;
