-- ============================================================
-- Message Notifications Trigger
-- Run this once in the Supabase SQL editor.
-- ============================================================

-- 1. Add new columns (safe — no-op if they already exist)
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS user_id          text,
  ADD COLUMN IF NOT EXISTS actor_id         text,
  ADD COLUMN IF NOT EXISTS entity_type      text,
  ADD COLUMN IF NOT EXISTS entity_id        text,
  ADD COLUMN IF NOT EXISTS message_id       text,
  ADD COLUMN IF NOT EXISTS body             text,
  ADD COLUMN IF NOT EXISTS is_read          boolean NOT NULL DEFAULT false;

-- 2. Backfill user_id / actor_id from old column names (if rows exist)
UPDATE public.notifications
SET
  user_id  = COALESCE(user_id,  to_user_id),
  actor_id = COALESCE(actor_id, from_user_id)
WHERE user_id IS NULL OR actor_id IS NULL;

-- 3. Index on (user_id, created_at) for fast per-user queries
CREATE INDEX IF NOT EXISTS notifs_user_id_created_idx
  ON public.notifications (user_id, created_at DESC);

-- ============================================================
-- 4. Trigger function
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_message_notification()
RETURNS trigger AS $$
DECLARE
  receiver_id text;
  sender_name text;
BEGIN
  -- Skip system/non-text messages with no content
  IF new.content IS NULL OR trim(new.content) = '' THEN
    RETURN new;
  END IF;

  -- Find the other participant via conversation_participants
  SELECT cp.user_id::text INTO receiver_id
  FROM public.conversation_participants cp
  WHERE cp.conversation_id = new.conversation_id
    AND cp.user_id::text <> new.sender_id::text
  LIMIT 1;

  -- Fallback: check the participants array column on conversations
  IF receiver_id IS NULL THEN
    SELECT p_id INTO receiver_id
    FROM (
      SELECT unnest(participants)::text AS p_id
      FROM public.conversations
      WHERE id::text = new.conversation_id::text
    ) sub
    WHERE p_id <> new.sender_id::text
    LIMIT 1;
  END IF;

  -- No receiver found — nothing to notify
  IF receiver_id IS NULL THEN
    RETURN new;
  END IF;

  -- Don't notify if sender = receiver
  IF receiver_id = new.sender_id::text THEN
    RETURN new;
  END IF;

  -- Get sender display name
  SELECT COALESCE(p.name, p.username, 'Someone')
  INTO sender_name
  FROM public.profiles p
  WHERE p.id::text = new.sender_id::text
  LIMIT 1;

  sender_name := COALESCE(sender_name, 'Someone');

  -- Insert notification for the receiver
  INSERT INTO public.notifications (
    id,
    user_id,
    actor_id,
    type,
    entity_type,
    entity_id,
    message_id,
    title,
    body,
    is_read,
    conversation_id,
    created_at
  ) VALUES (
    gen_random_uuid()::text,
    receiver_id,
    new.sender_id::text,
    'new_message',
    'conversation',
    new.conversation_id::text,
    new.id::text,
    sender_name || ' sent you a message',
    left(new.content, 120),
    false,
    new.conversation_id::text,
    now()
  );

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 5. Attach trigger to messages table
-- ============================================================
DROP TRIGGER IF EXISTS on_message_create_notification ON public.messages;

CREATE TRIGGER on_message_create_notification
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.create_message_notification();
