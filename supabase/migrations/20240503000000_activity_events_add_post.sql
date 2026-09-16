-- Adds 'post_published' to activity_events.activity_type -- Connect ->
-- Activity now also surfaces real entries from the existing `posts` table
-- (postsApi.create), alongside portfolio/listing/connection/recommendation
-- events. This does NOT change Connect -> Portfolio, which still reads
-- exclusively from portfolio_items/portfolio_albums per its own spec.
ALTER TABLE public.activity_events DROP CONSTRAINT IF EXISTS activity_events_activity_type_check;
ALTER TABLE public.activity_events ADD CONSTRAINT activity_events_activity_type_check
  CHECK (activity_type IN (
    'portfolio_published', 'portfolio_album_published', 'service_published',
    'opportunity_published', 'listing_published', 'connection_created',
    'recommendation_received', 'post_published'
  ));
