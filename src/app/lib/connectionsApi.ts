// Professional Connections -- a real, accepted, mutual relationship between
// two FILMONS users, distinct from Follow/Following (one-directional, no
// acceptance step -- see useFollowCounts.ts / the `follows` table). This is
// the largest input to the FILMONS Reliability Score (45/100 points, see
// supabase/migrations/20240501000000_filmons_reliability_system.sql).
//
// Rows are always stored with user_a_id < user_b_id (a canonical, ordered
// pair enforced by a DB CHECK constraint) so a pair can never be duplicated
// in either direction -- every function here sorts the two ids before
// reading/writing so callers never need to think about ordering themselves.
import { supabase } from '../../lib/supabase';

export type ConnectionStatus = 'none' | 'pending_sent' | 'pending_received' | 'connected';

export interface ConnectionSummary {
  id: string;
  otherUser: {
    id: string; name: string; username: string | null; avatar_url: string | null;
    account_type: string | null; is_verified: boolean;
  };
  createdAt: string;
  /** Only meaningful on a pending-received row (an invitation's note). */
  note?: string | null;
}

function orderedPair(idA: string, idB: string): [string, string] {
  return idA < idB ? [idA, idB] : [idB, idA];
}

// The current relationship between `meId` and `otherId`, from `meId`'s point
// of view (pending_sent = I requested it, pending_received = they did).
export async function getConnectionStatus(meId: string, otherId: string): Promise<ConnectionStatus> {
  if (meId === otherId) return 'none';
  const [a, b] = orderedPair(meId, otherId);
  const { data } = await supabase
    .from('professional_connections').select('status, requested_by')
    .eq('user_a_id', a).eq('user_b_id', b).maybeSingle();
  if (!data || data.status === 'declined' || data.status === 'removed') return 'none';
  if (data.status === 'accepted') return 'connected';
  return data.requested_by === meId ? 'pending_sent' : 'pending_received';
}

export async function sendConnectionRequest(meId: string, otherId: string, note?: string): Promise<boolean> {
  if (meId === otherId) return false;
  const [a, b] = orderedPair(meId, otherId);
  const { error } = await supabase.from('professional_connections')
    .upsert({ user_a_id: a, user_b_id: b, requested_by: meId, status: 'pending', responded_at: null, note: note?.trim() || null },
      { onConflict: 'user_a_id,user_b_id' });
  if (error) { console.error('[connections] request error:', error.message); return false; }
  return true;
}

export async function respondToConnectionRequest(meId: string, otherId: string, accept: boolean): Promise<boolean> {
  const [a, b] = orderedPair(meId, otherId);
  const { error } = await supabase.from('professional_connections')
    .update({ status: accept ? 'accepted' : 'declined', responded_at: new Date().toISOString() })
    .eq('user_a_id', a).eq('user_b_id', b);
  return !error;
}

// Either party can end an existing/pending connection.
export async function removeConnection(meId: string, otherId: string): Promise<boolean> {
  const [a, b] = orderedPair(meId, otherId);
  const { error } = await supabase.from('professional_connections')
    .update({ status: 'removed', responded_at: new Date().toISOString() })
    .eq('user_a_id', a).eq('user_b_id', b);
  return !error;
}

export async function getConnectionCount(userId: string): Promise<number> {
  const { count } = await supabase.from('professional_connections')
    .select('id', { count: 'exact', head: true }).eq('status', 'accepted')
    .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`);
  return count ?? 0;
}

// Accepted connections for `userId`, newest first -- manual profile join,
// same pattern recommendationsApi.getRecommendations uses for authors (no FK
// to profiles, so PostgREST can't auto-embed).
export async function listConnections(userId: string, opts: { limit?: number } = {}): Promise<ConnectionSummary[]> {
  let q = supabase.from('professional_connections').select('id, user_a_id, user_b_id, created_at')
    .eq('status', 'accepted').or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
    .order('created_at', { ascending: false });
  if (opts.limit) q = q.limit(opts.limit);
  const { data, error } = await q;
  if (error) { console.warn('[connections] list error:', error.message); return []; }
  const rows = data ?? [];
  if (!rows.length) return [];

  const otherIds = rows.map((r: any) => r.user_a_id === userId ? r.user_b_id : r.user_a_id);
  const { data: profileRows } = await supabase
    .from('profiles').select('id, name, username, avatar_url, account_type, is_verified').in('id', otherIds);
  const profileMap = new Map((profileRows ?? []).map((p: any) => [p.id, p]));

  return rows
    .map((r: any) => {
      const otherId = r.user_a_id === userId ? r.user_b_id : r.user_a_id;
      const otherUser = profileMap.get(otherId);
      return otherUser ? { id: r.id, otherUser, createdAt: r.created_at } : null;
    })
    .filter((r): r is ConnectionSummary => r !== null);
}

// Pending requests `userId` has RECEIVED (for an accept/decline inbox).
export async function listPendingReceived(userId: string): Promise<ConnectionSummary[]> {
  const { data, error } = await supabase.from('professional_connections')
    .select('id, user_a_id, user_b_id, created_at, requested_by, note')
    .eq('status', 'pending').neq('requested_by', userId)
    .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
    .order('created_at', { ascending: false });
  if (error || !data?.length) return [];

  const otherIds = data.map((r: any) => r.user_a_id === userId ? r.user_b_id : r.user_a_id);
  const { data: profileRows } = await supabase
    .from('profiles').select('id, name, username, avatar_url, account_type, is_verified').in('id', otherIds);
  const profileMap = new Map((profileRows ?? []).map((p: any) => [p.id, p]));

  return data
    .map((r: any) => {
      const otherId = r.user_a_id === userId ? r.user_b_id : r.user_a_id;
      const otherUser = profileMap.get(otherId);
      return otherUser ? { id: r.id, otherUser, createdAt: r.created_at, note: r.note } : null;
    })
    .filter((r): r is ConnectionSummary => r !== null);
}

// The note attached to the pending request BETWEEN meId and otherId, from
// whichever side sent it -- used to show "Hi Maya, I saw your..." on the
// recipient's side of the Connect flow without needing the full inbox.
export async function getPendingNote(meId: string, otherId: string): Promise<string | null> {
  const [a, b] = orderedPair(meId, otherId);
  const { data } = await supabase.from('professional_connections')
    .select('note').eq('user_a_id', a).eq('user_b_id', b).eq('status', 'pending').maybeSingle();
  return data?.note ?? null;
}

// Count of people BOTH meId and otherId are accepted-connected to -- pure
// network context (never fed into the Reliability Score). Two small
// queries + a client-side set intersection rather than a DB function,
// consistent with how the rest of this app avoids Postgres functions it
// can't test against the live database from here.
export async function getMutualConnectionCount(meId: string, otherId: string): Promise<number> {
  if (meId === otherId) return 0;
  const [mine, theirs] = await Promise.all([listConnections(meId), listConnections(otherId)]);
  const mineIds = new Set(mine.map(c => c.otherUser.id));
  return theirs.filter(c => mineIds.has(c.otherUser.id)).length;
}

export type ConnectionDegree = 1 | 2 | 3;

// LinkedIn-style network degree -- 1st (directly connected), 2nd (share a
// mutual connection), 3rd+ (wider network). Display/context only, per
// spec -- never used in the Reliability Score.
export async function getConnectionDegree(meId: string, otherId: string): Promise<ConnectionDegree> {
  if (meId === otherId) return 1;
  const status = await getConnectionStatus(meId, otherId);
  if (status === 'connected') return 1;
  const mutual = await getMutualConnectionCount(meId, otherId);
  return mutual > 0 ? 2 : 3;
}
