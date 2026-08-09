-- Reviews created before reviewed_user_id existed (or before the client
-- started sending it) have it NULL, which made them invisible to
-- "Reviews Received" queries (reviews_api.getReceivedReviews filters on
-- reviewed_user_id) and excluded them from the reviewed listing owner's
-- average rating. Backfill from the reviewed listing's actual owner.
UPDATE public.reviews r
SET reviewed_user_id = l.user_id
FROM public.listings l
WHERE r.listing_id = l.id
  AND r.reviewed_user_id IS NULL;
