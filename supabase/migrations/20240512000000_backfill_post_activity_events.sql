-- One-time backfill for Connect's post_published activity events.
--
-- activity_events.activity_type didn't allow 'post_published' until
-- 20240503000000_activity_events_add_post.sql was applied. Any post
-- created before that migration actually ran on this database published
-- fine (postsApi.create() itself never depended on this insert
-- succeeding), but logActivityEvent()'s insert was rejected by the old
-- CHECK constraint and just warned to the console -- so those posts
-- silently never got an activity_events row and never appeared in Connect.
--
-- MUST run AFTER 20240503000000_activity_events_add_post.sql (or this
-- insert hits the same old constraint and fails the same way). Safe to
-- run more than once -- the NOT EXISTS guard skips posts that already
-- have their event (including ones created after the constraint fix).
--
-- Preserves each post's own created_at (not now()) so it sorts into
-- Connect at the point in time it was actually published, not at the top
-- as if it were brand new.
INSERT INTO public.activity_events (actor_id, activity_type, target_type, target_id, title, created_at)
SELECT
  p.author_id,
  'post_published',
  'post',
  p.id::text,
  substring(coalesce(p.content, '') from 1 for 80),
  p.created_at
FROM public.posts p
WHERE NOT EXISTS (
  SELECT 1 FROM public.activity_events ae
  WHERE ae.target_type = 'post' AND ae.target_id = p.id::text AND ae.activity_type = 'post_published'
);
