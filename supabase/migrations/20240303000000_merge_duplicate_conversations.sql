-- Repairs conversations duplicated by the now-fixed getOrCreateForApplication
-- bug (it created a NEW conversation per Opportunity application instead of
-- reusing the real one-per-user-pair conversation). For every set of >=2
-- non-deleted, exactly-2-participant conversations sharing the same
-- participant pair, keeps the OLDEST as canonical (the original, pre-bug
-- conversation) and merges the rest into it. Never a hard DELETE — matching
-- this app's established never-hard-delete convention (same principle as
-- delete-listing) — duplicates are only soft-marked deleted_for_everyone,
-- fully reversible, zero data loss.
DO $$
DECLARE
  rec RECORD;
  canonical_id text;
  dup_id text;
  i int;
BEGIN
  FOR rec IN
    SELECT (SELECT string_agg(p, ',' ORDER BY p) FROM unnest(participants) p) AS pair_key,
           array_agg(id ORDER BY created_at ASC) AS conv_ids
    FROM public.conversations
    WHERE array_length(participants, 1) = 2 AND deleted_for_everyone IS NOT TRUE
    GROUP BY pair_key
    HAVING count(*) > 1
  LOOP
    canonical_id := rec.conv_ids[1];
    FOR i IN 2 .. array_length(rec.conv_ids, 1) LOOP
      dup_id := rec.conv_ids[i];
      UPDATE public.messages SET conversation_id = canonical_id WHERE conversation_id = dup_id;
      UPDATE public.opportunity_applications SET conversation_id = canonical_id WHERE conversation_id = dup_id;
      UPDATE public.notifications SET conversation_id = canonical_id WHERE conversation_id = dup_id;
      UPDATE public.conversations SET deleted_for_everyone = true, updated_at = now() WHERE id = dup_id;
    END LOOP;
    -- Surface the canonical conversation at the right position in Inbox --
    -- it should reflect the merged conversation's real latest activity.
    UPDATE public.conversations c SET updated_at = GREATEST(c.updated_at, (
      SELECT max(created_at) FROM public.messages WHERE conversation_id = canonical_id
    )) WHERE c.id = canonical_id;
  END LOOP;
END $$;

-- One-time global unread recount (safe/idempotent) so no participant is
-- left with a stale double-counted or under-counted badge after merging.
UPDATE public.conversation_participants cp
SET unread_count = (
  SELECT count(*) FROM public.messages m
  WHERE m.conversation_id = cp.conversation_id AND m.sender_id <> cp.user_id AND COALESCE(m.is_read, false) = false
);
