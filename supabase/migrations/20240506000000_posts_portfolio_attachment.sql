-- Adds Portfolio-attachment columns to `posts` -- the table itself has no
-- tracked CREATE TABLE in this repo (it's a live-only table, same as the
-- existing listing_* columns below it were added), so this migration only
-- adds the new columns needed for Create Post's "Attach Portfolio Work"
-- feature. Stores the real portfolio_item_id plus small cached display
-- fields (title/category/thumbnail) so PostCard never needs a live join --
-- same pattern already used for listing_id/listing_title/etc.
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS portfolio_item_id       text,
  ADD COLUMN IF NOT EXISTS portfolio_item_title     text,
  ADD COLUMN IF NOT EXISTS portfolio_item_category  text,
  ADD COLUMN IF NOT EXISTS portfolio_item_thumb     text;
