-- ─────────────────────────────────────────────────────────────────────────────
-- follows table
-- Canonical source of truth for follow relationships.
-- follower_id  = the user who clicked Follow
-- following_id = the user being followed
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.follows (
  id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id  uuid         NOT NULL,
  following_id uuid         NOT NULL,
  created_at   timestamptz  NOT NULL DEFAULT now(),

  -- A user cannot follow themselves
  CONSTRAINT follows_no_self   CHECK (follower_id <> following_id),
  -- Each follow relationship is unique
  CONSTRAINT follows_unique    UNIQUE (follower_id, following_id)
);

-- Fast lookups: "who follows user X?" and "who does user X follow?"
CREATE INDEX IF NOT EXISTS follows_follower_idx  ON public.follows (follower_id);
CREATE INDEX IF NOT EXISTS follows_following_idx ON public.follows (following_id);

-- ── Row-Level Security ────────────────────────────────────────────────────────
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon) can read follow relationships — profiles are public
CREATE POLICY "follows_read"
  ON public.follows FOR SELECT
  USING (true);

-- Insert: require non-null IDs and no self-follow.
-- Application code validates the current user before calling insert.
-- (auth.uid() is not used because the app uses a custom auth system.)
CREATE POLICY "follows_insert"
  ON public.follows FOR INSERT
  WITH CHECK (
    follower_id  IS NOT NULL AND
    following_id IS NOT NULL AND
    follower_id <> following_id
  );

-- Authenticated users may only delete their own follow rows
CREATE POLICY "follows_delete"
  ON public.follows FOR DELETE
  TO authenticated
  USING (follower_id = auth.uid());
