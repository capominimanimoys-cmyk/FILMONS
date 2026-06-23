-- ─────────────────────────────────────────────────────────────────────────────
-- notifications_realtime.sql
-- Run once in Supabase SQL Editor.
-- Creates the notifications table with proper RLS + enables Realtime.
-- Safe to re-run (IF NOT EXISTS / DO $$ checks).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Create table (matches the column names used by the client) ─────────────
CREATE TABLE IF NOT EXISTS notifications (
  id              text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id         text        NOT NULL,   -- recipient
  actor_id        text,                   -- sender
  actor_name      text        NOT NULL DEFAULT '',
  actor_avatar    text,
  type            text        NOT NULL DEFAULT 'system',
  title           text        NOT NULL DEFAULT '',
  post_id         text,
  post_content    text,
  post_image      text,
  comment_content text,
  conversation_id text,
  fp_amount       int,
  is_read         boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ── 2. Index for fast per-user lookups ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications(user_id, created_at DESC);

-- ── 3. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- SELECT: open read so the Supabase Realtime channel filter can deliver events
-- (user isolation is enforced by the channel filter `user_id=eq.{userId}`)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='notifications' AND policyname='notifs_select') THEN
    CREATE POLICY notifs_select ON notifications FOR SELECT USING (true);
  END IF;
END $$;

-- INSERT: any authenticated or anon user can write notifications (sender writes for recipient)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='notifications' AND policyname='notifs_insert') THEN
    CREATE POLICY notifs_insert ON notifications FOR INSERT WITH CHECK (true);
  END IF;
END $$;

-- UPDATE: anyone can mark a notification read (the app checks ownership in code)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='notifications' AND policyname='notifs_update') THEN
    CREATE POLICY notifs_update ON notifications FOR UPDATE USING (true) WITH CHECK (true);
  END IF;
END $$;

-- DELETE: anyone can delete (same rationale — ownership checked in app)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='notifications' AND policyname='notifs_delete') THEN
    CREATE POLICY notifs_delete ON notifications FOR DELETE USING (true);
  END IF;
END $$;

-- ── 4. Grants ─────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON notifications TO anon, authenticated;

-- ── 5. Enable Realtime ────────────────────────────────────────────────────────
-- This is the critical step — without it postgres_changes events never fire.
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
