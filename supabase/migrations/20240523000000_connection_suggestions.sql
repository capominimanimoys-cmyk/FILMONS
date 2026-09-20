-- Backs "People you may like to connect with" (Home discovery section +
-- /connections Suggested tab). Only new state needed: which suggestions a
-- user has explicitly dismissed (`x` on a card) -- everything else the
-- suggestion algorithm needs (role/city match, mutual connections) is
-- already queryable from profiles + the existing professional_connections
-- table, so no separate suggestions/scores table.
CREATE TABLE IF NOT EXISTS public.connection_dismissals (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid        NOT NULL,
  dismissed_user_id  uuid        NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, dismissed_user_id)
);
CREATE INDEX IF NOT EXISTS connection_dismissals_user_idx ON public.connection_dismissals (user_id);

ALTER TABLE public.connection_dismissals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "connection_dismissals_all" ON public.connection_dismissals;
CREATE POLICY "connection_dismissals_all" ON public.connection_dismissals FOR ALL USING (true) WITH CHECK (true);
