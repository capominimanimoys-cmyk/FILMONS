-- Drop auto-created FK constraints on follows table.
-- The app uses a custom auth flow; follower_id / following_id are profile UUIDs
-- stored in public.profiles, not necessarily present in auth.users.
-- Application code validates both IDs exist before inserting.

ALTER TABLE public.follows DROP CONSTRAINT IF EXISTS follows_follower_id_fkey;
ALTER TABLE public.follows DROP CONSTRAINT IF EXISTS follows_following_id_fkey;
