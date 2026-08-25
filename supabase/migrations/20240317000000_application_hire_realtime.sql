-- ApplicationCardBubble.tsx and HireRequestCardBubble.tsx have subscribed to
-- postgres_changes on these four tables since they were built, but none of
-- them were ever added to the supabase_realtime publication (only
-- `notifications` was, in 20240105000000_notifications_realtime.sql) --
-- meaning those subscriptions have silently never fired a single event.
-- The application/hire status card only ever updated on next full reload
-- (leaving and returning to the conversation), never live while it was
-- open, exactly matching the reported bug.
--
-- ALTER PUBLICATION ... ADD TABLE errors if the table is already a member
-- (unlike CREATE TABLE IF NOT EXISTS), so each is guarded with an explicit
-- existence check to keep this migration safely re-runnable.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'opportunity_applications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.opportunity_applications;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'opportunity_transactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.opportunity_transactions;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'hire_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.hire_requests;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'hire_transactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.hire_transactions;
  END IF;
END $$;
