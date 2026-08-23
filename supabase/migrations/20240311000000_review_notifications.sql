-- Notify + email a listing owner when someone reviews their listing.
-- Minimal, targeted extension of the existing notifications table
-- (matches how other features this session added a few nullable
-- columns rather than a parallel table) plus two new toggles on the
-- existing notification_settings table.

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS listing_id text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS review_id text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS rating integer;

-- One review -> one notification, even under retry/rerender/duplicate-call
-- conditions. Scoped to type='listing_review' so it never constrains any
-- other notification type's (user_id, review_id) combination (review_id
-- is NULL for all of them, and NULL never conflicts with itself in a
-- unique index).
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_review_dedup
  ON public.notifications(user_id, review_id) WHERE type = 'listing_review';

ALTER TABLE public.notification_settings ADD COLUMN IF NOT EXISTS notif_reviews boolean NOT NULL DEFAULT true;
ALTER TABLE public.notification_settings ADD COLUMN IF NOT EXISTS email_reviews boolean NOT NULL DEFAULT true;
