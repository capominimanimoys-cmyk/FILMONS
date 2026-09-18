-- LinkedIn-style Connect flow: lets a request carry an optional personal
-- note ("Hi Maya, I saw your cinematography work..."), shown to the
-- recipient in their invitations inbox. Purely additive -- existing rows
-- (and requests sent without a note) just have note = null.
ALTER TABLE public.professional_connections
  ADD COLUMN IF NOT EXISTS note text;
