// Professional endorsements ("Recommendations") on a creator's Profile —
// distinct from reviewsApi's transactional Review (tied to a listing/
// booking). See supabase/migrations/20240426000000_recommendations.sql.
//
// recommendations.recommender_id/recipient_id have no declared FK to
// profiles, so PostgREST can't auto-embed the recommender's profile —
// fetched as a separate batched query and merged client-side, same pattern
// portfolioApi.ts's getItemComments uses for comment authors.
import { supabase } from '../../lib/supabase';

export interface Recommendation {
  id: string;
  recommender_id: string;
  recipient_id: string;
  role_snapshot: string | null;
  relationship: string | null;
  body: string;
  created_at: string;
  updated_at: string;
  recommender: {
    id: string; name: string; username: string | null; avatar_url: string | null;
    is_verified: boolean; city: string | null;
  } | null;
}

export async function getRecommendations(
  recipientId: string, opts: { limit?: number } = {},
): Promise<Recommendation[]> {
  let q = supabase.from('recommendations').select('*').eq('recipient_id', recipientId).order('created_at', { ascending: false });
  if (opts.limit) q = q.limit(opts.limit);
  const { data, error } = await q;
  if (error) { console.warn('[recommendations] fetch error:', error.message); return []; }
  const rows = data ?? [];
  if (!rows.length) return [];

  const recommenderIds = [...new Set(rows.map((r: any) => r.recommender_id))];
  const { data: profileRows } = await supabase
    .from('profiles').select('id, name, username, avatar_url, is_verified, city').in('id', recommenderIds);
  const profileMap = new Map((profileRows ?? []).map((p: any) => [p.id, p]));

  return rows.map((r: any) => ({
    ...r,
    recommender: profileMap.get(r.recommender_id) ?? null,
  }));
}

export async function getRecommendationCount(recipientId: string): Promise<number> {
  const { count } = await supabase.from('recommendations').select('id', { count: 'exact', head: true }).eq('recipient_id', recipientId);
  return count ?? 0;
}

export async function hasRecommended(recommenderId: string, recipientId: string): Promise<boolean> {
  const { data } = await supabase.from('recommendations').select('id').eq('recommender_id', recommenderId).eq('recipient_id', recipientId).maybeSingle();
  return !!data;
}

// Upsert on (recommender_id, recipient_id) -- writing again edits your own
// recommendation rather than creating a second row, matching how a single
// professional endorsement is normally thought of.
export async function createOrUpdateRecommendation(params: {
  recommenderId: string; recipientId: string; roleSnapshot?: string; relationship?: string; body: string;
}): Promise<boolean> {
  const { error } = await supabase.from('recommendations').upsert({
    recommender_id: params.recommenderId,
    recipient_id: params.recipientId,
    role_snapshot: params.roleSnapshot || null,
    relationship: params.relationship || null,
    body: params.body,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'recommender_id,recipient_id' });
  if (error) { console.error('[recommendations] create/update error:', error.message); return false; }
  return true;
}

// Either party can remove it -- the recipient hiding an unwanted one, or the
// author retracting their own. Caller is responsible for only offering the
// action to whichever side is actually allowed (checked client-side, same
// permissive-RLS pattern as the rest of this app).
export async function deleteRecommendation(id: string): Promise<boolean> {
  const { error } = await supabase.from('recommendations').delete().eq('id', id);
  return !error;
}
