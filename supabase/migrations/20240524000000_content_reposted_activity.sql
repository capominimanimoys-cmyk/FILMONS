-- Adds 'content_reposted' to activity_events.activity_type -- makes a
-- plain Repost (Post or Portfolio item/album) actually distribute into
-- followers' Connect feeds, which it never did before (the reposts/
-- portfolio_reposts tables only ever powered a vanity counter + the
-- reposter's own Profile tab -- see this session's repost architecture
-- investigation). target_type/target_id reuse the SAME values a
-- post_published/portfolio_published event already uses ('post' |
-- 'portfolio_item' | 'portfolio_album'), so filterVisible()'s EXISTING
-- per-type visibility checks in activityApi.ts already cover this new
-- type for free -- if the original is deleted, made private, or its
-- portfolio visibility changes, the repost's Activity entry disappears
-- along with it, with zero additional code. This is exactly the
-- "one source of truth, not a copy" architecture the Repost spec asks
-- for, reusing the mechanism that already delivers it for every other
-- activity type.
ALTER TABLE public.activity_events DROP CONSTRAINT IF EXISTS activity_events_activity_type_check;
ALTER TABLE public.activity_events ADD CONSTRAINT activity_events_activity_type_check
  CHECK (activity_type IN (
    'portfolio_published', 'portfolio_album_published', 'service_published',
    'opportunity_published', 'listing_published', 'connection_created',
    'recommendation_received', 'post_published', 'content_reposted'
  ));
