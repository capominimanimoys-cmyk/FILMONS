-- Admin "Support Chats" section: unread tracking (nothing existed before
-- this -- support_messages had no read/unread concept at all) plus a
-- single view the admin console can query in one round trip instead of
-- N+1'ing "latest message" and "unread count" per case.

ALTER TABLE public.support_messages
  ADD COLUMN IF NOT EXISTS is_read_by_admin boolean NOT NULL DEFAULT true;

-- Backfill: existing rows predate this feature -- treat them all as
-- already-read so rollout doesn't flood the admin console with "unread"
-- on every historical case. New rows default to true too (see below);
-- only a genuine new customer-sent message is ever inserted as false.
UPDATE public.support_messages SET is_read_by_admin = true WHERE is_read_by_admin = false;

CREATE INDEX IF NOT EXISTS idx_support_messages_unread
  ON public.support_messages (case_id) WHERE is_read_by_admin = false;

-- One row per case: customer identity, latest non-internal-note message
-- (content/timestamp/sender), unread-by-admin count, and the assigned
-- agent's name -- what the Support Chats list and search both query
-- directly instead of separate per-case lookups. RLS is enforced on the
-- underlying tables already (open trust model, same as the rest of this
-- app); a view inherits that, nothing new to secure here.
CREATE OR REPLACE VIEW public.support_cases_admin_view AS
SELECT
  sc.*,
  p.name       AS user_name,
  p.email      AS user_email,
  p.avatar_url AS user_avatar,
  lm.content      AS last_message_content,
  lm.created_at   AS last_message_at,
  lm.sender_type  AS last_message_sender_type,
  COALESCE(unread.cnt, 0)::integer AS unread_count,
  au.name AS assigned_admin_name
FROM public.support_cases sc
LEFT JOIN public.profiles p ON p.id = sc.user_id
LEFT JOIN LATERAL (
  SELECT content, created_at, sender_type
  FROM public.support_messages
  WHERE case_id = sc.id AND is_internal_note = false
  ORDER BY created_at DESC
  LIMIT 1
) lm ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS cnt
  FROM public.support_messages
  WHERE case_id = sc.id AND sender_type = 'user' AND is_read_by_admin = false
) unread ON true
LEFT JOIN public.admin_users au ON au.id = sc.assigned_admin_id;

-- Marks every unread customer message in a case as read -- called when
-- the admin opens that case. A plain client-side UPDATE (same open-RLS
-- trust model already used for direct table writes elsewhere, e.g.
-- supportApi.sendUserMessage) would work too, but wrapping it in a
-- function keeps "what counts as read" defined in one place.
CREATE OR REPLACE FUNCTION public.fn_mark_case_read_by_admin(p_case_id uuid)
RETURNS void AS $$
  UPDATE public.support_messages
  SET is_read_by_admin = true
  WHERE case_id = p_case_id AND sender_type = 'user' AND is_read_by_admin = false;
$$ LANGUAGE sql SECURITY DEFINER;
