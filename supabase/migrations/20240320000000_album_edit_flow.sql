-- Album detail fields + collaborator credits for the Edit Album screen.
-- portfolio_albums previously only had title/description/cover/visibility;
-- this adds the richer metadata the Edit Album flow needs, and a
-- dedicated credits table (an album can credit both Filmons members and
-- people who aren't on the platform yet).
ALTER TABLE public.portfolio_albums
  ADD COLUMN IF NOT EXISTS primary_role      text,
  ADD COLUMN IF NOT EXISTS additional_roles  jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS category          text,
  ADD COLUMN IF NOT EXISTS tags              jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS location          text,
  ADD COLUMN IF NOT EXISTS work_date         text,
  ADD COLUMN IF NOT EXISTS show_on_profile   boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.portfolio_album_credits (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id          uuid NOT NULL REFERENCES public.portfolio_albums(id) ON DELETE CASCADE,
  role              text NOT NULL,
  creator_user_id   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  unlisted_name     text,
  sort_order        integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (creator_user_id IS NOT NULL OR unlisted_name IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS album_credits_album_idx ON public.portfolio_album_credits (album_id);

ALTER TABLE public.portfolio_album_credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "album_credits_read"   ON public.portfolio_album_credits;
DROP POLICY IF EXISTS "album_credits_insert" ON public.portfolio_album_credits;
DROP POLICY IF EXISTS "album_credits_update" ON public.portfolio_album_credits;
DROP POLICY IF EXISTS "album_credits_delete" ON public.portfolio_album_credits;

CREATE POLICY "album_credits_read"   ON public.portfolio_album_credits FOR SELECT USING (true);
CREATE POLICY "album_credits_insert" ON public.portfolio_album_credits FOR INSERT WITH CHECK (true);
CREATE POLICY "album_credits_update" ON public.portfolio_album_credits FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "album_credits_delete" ON public.portfolio_album_credits FOR DELETE USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolio_album_credits TO anon, authenticated;
