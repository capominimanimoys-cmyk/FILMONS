-- Real admin moderation state for listings (and opportunities, which
-- are listings with listing_type='opportunity') -- previously the only
-- status concept was `is_active`, the OWNER's own on/off toggle
-- (set by delete-listing, an owner-authenticated endpoint). This is a
-- separate, admin-controlled state so an admin pausing/removing a
-- listing doesn't fight with or get confused for the owner's own
-- toggle, and so it can be audited.
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS moderation_status text NOT NULL DEFAULT 'active'
    CHECK (moderation_status IN ('active', 'paused', 'removed'));

CREATE TABLE IF NOT EXISTS public.listing_moderation_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id      text NOT NULL,
  admin_identifier text NOT NULL,
  action          text NOT NULL CHECK (action IN ('paused', 'restored', 'removed')),
  reason          text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_listing_moderation_log_listing ON public.listing_moderation_log (listing_id, created_at DESC);

ALTER TABLE public.listing_moderation_log ENABLE ROW LEVEL SECURITY;
-- No policy -- service-role (the admin-moderate-listing edge function)
-- only, same trust model as verification_audit_log.
