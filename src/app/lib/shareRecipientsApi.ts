// "Share with" recipient discovery for the universal SharePostSheet.
// Two modes: getShareRecipientsBrowse (empty query -- a useful, BOUNDED
// initial subset, not the whole profiles table) and searchShareRecipients
// (server-side, paginated, for when the user actually types something).
//
// Eligibility: a real, named profile that isn't the current user. This
// schema has no account deletion/deactivation/suspension status anywhere
// (no such column on `profiles`, no admin suspend action -- confirmed by
// investigation, see AdminUsers.tsx's own "No suspended/active-status
// filter" comment) and no server-enforced "blocked relationship" either
// (chatApi.blockUser only hides a conversation locally on the blocker's
// own device -- it was never persisted as a real relationship anywhere).
// So there is nothing real to filter on beyond these two checks; this is
// disclosed here rather than inventing status columns nobody asked for.
import { supabase } from '../../lib/supabase';
import { listConnections } from './connectionsApi';

export interface ShareRecipient {
  id: string; name: string; username: string | null; avatar_url: string | null;
  account_type: string | null; primary_role: string | null; business_industry: string | null;
  is_verified: boolean | null;
}

const SHARE_RECIPIENT_SELECT = 'id, name, username, avatar_url, account_type, primary_role, business_industry, is_verified';
const BROWSE_LIMIT = 40;
const SEARCH_PAGE_SIZE = 30;

function toRecipient(p: any): ShareRecipient {
  return {
    id: p.id, name: p.name, username: p.username ?? null, avatar_url: p.avatar_url ?? null,
    account_type: p.account_type ?? null, primary_role: p.primary_role ?? null,
    business_industry: p.business_industry ?? null, is_verified: p.is_verified ?? false,
  };
}

function eligibleProfiles(userId: string) {
  return supabase.from('profiles').select(SHARE_RECIPIENT_SELECT)
    .not('name', 'is', null).neq('name', '').neq('id', userId);
}

async function recentConversationPartnerIds(userId: string, limit: number): Promise<string[]> {
  // Same participants-array contains syntax chatApi's own conversation
  // lookups already use (a native text[] column, not jsonb).
  const { data } = await supabase.from('conversations')
    .select('participants, updated_at')
    .or(`participants.cs.{"${userId}"}`)
    .eq('deleted_for_everyone', false)
    .order('updated_at', { ascending: false })
    .limit(limit * 3);
  const ids: string[] = [];
  for (const row of (data ?? []) as any[]) {
    const parts: string[] = Array.isArray(row.participants)
      ? row.participants
      : (() => { try { return JSON.parse(row.participants); } catch { return []; } })();
    const other = parts.find(p => p !== userId);
    if (other && !ids.includes(other)) ids.push(other);
    if (ids.length >= limit) break;
  }
  return ids;
}

// Initial "Share with" list before the user types anything -- blended in
// priority order (Connections -> recent conversation partners -> people
// followed -> other real profiles, newest/verified first, to fill out the
// page), deduped, each id kept at the highest-priority tier it appears in.
export async function getShareRecipientsBrowse(userId: string): Promise<ShareRecipient[]> {
  const [connections, recentIds, followingRows] = await Promise.all([
    listConnections(userId, { limit: BROWSE_LIMIT }),
    recentConversationPartnerIds(userId, 15),
    supabase.from('follows').select('following_id').eq('follower_id', userId)
      .order('created_at', { ascending: false }).limit(15)
      .then(r => (r.data ?? []).map((row: any) => row.following_id as string), () => [] as string[]),
  ]);

  const ordered: string[] = [];
  const seen = new Set<string>([userId]);
  const push = (id: string) => { if (!seen.has(id)) { seen.add(id); ordered.push(id); } };
  connections.forEach(c => push(c.otherUser.id));
  recentIds.forEach(push);
  followingRows.forEach(push);

  const need = Math.max(0, BROWSE_LIMIT - ordered.length);
  const [priorityRes, backfillRes] = await Promise.all([
    ordered.length
      ? supabase.from('profiles').select(SHARE_RECIPIENT_SELECT).in('id', ordered)
      : Promise.resolve({ data: [] as any[] }),
    need > 0
      ? eligibleProfiles(userId).order('created_at', { ascending: false }).limit(need + ordered.length + 15)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const profileMap = new Map((priorityRes.data ?? []).map((p: any) => [p.id, p]));
  const result: ShareRecipient[] = ordered.map(id => profileMap.get(id)).filter(Boolean).map(toRecipient);

  for (const p of (backfillRes.data ?? []) as any[]) {
    if (result.length >= BROWSE_LIMIT) break;
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    result.push(toRecipient(p));
  }
  return result;
}

// Server-side search, paginated -- name/username/primary_role/
// business_industry (Business accounts' identity field, per the FILMONS
// identity rule: Business -> Business Industry, everyone else -> Primary
// Role). `cursor` is a plain offset, same simple-pagination style this
// app's other short paginated lists already use.
export async function searchShareRecipients(
  userId: string, rawQuery: string, cursor: number,
): Promise<{ recipients: ShareRecipient[]; nextCursor: number | null }> {
  const q = rawQuery.trim();
  if (!q) return { recipients: [], nextCursor: null };
  const from = cursor, to = cursor + SEARCH_PAGE_SIZE - 1;
  const { data, error } = await eligibleProfiles(userId)
    .or(`name.ilike.%${q}%,username.ilike.%${q}%,primary_role.ilike.%${q}%,business_industry.ilike.%${q}%`)
    .order('is_verified', { ascending: false })
    .range(from, to);
  if (error) { console.warn('[shareRecipients] search error:', error.message); return { recipients: [], nextCursor: null }; }
  const rows = (data ?? []).map(toRecipient);
  return { recipients: rows, nextCursor: rows.length === SEARCH_PAGE_SIZE ? to + 1 : null };
}
