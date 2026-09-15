// Backs the Profile page's "Profile Interaction" metric -- see
// supabase/migrations/20240429000000_profile_interactions.sql for why this
// is a separate table from portfolio_engagement_events (item-level view/
// like/comment/share) and from personalization.ts's own, differently-
// purposed `portfolio_interactions` table.
import { supabase } from '../../lib/supabase';

export type ProfileEngagementAction =
  | 'follow' | 'message' | 'portfolio_save' | 'view_portfolio_click'
  | 'service_open' | 'listing_open' | 'listing_save' | 'profile_share'
  | 'recommendation_submitted' | 'social_link_click';

const DEDUP_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
const DEDUP_KEY_PREFIX = 'filmons_pe_dedup:';

// Reasonable (not bulletproof/server-enforced -- this is an analytics
// metric, not a security limit) session-scoped dedup: a repeated click,
// rerender, or refresh for the same action+target within the window is
// dropped instead of inflating the count. Genuinely separate visits later
// (or in a new tab/session) still count.
function shouldLog(key: string): boolean {
  try {
    const full = DEDUP_KEY_PREFIX + key;
    const last = Number(sessionStorage.getItem(full) || 0);
    if (Date.now() - last < DEDUP_WINDOW_MS) return false;
    sessionStorage.setItem(full, String(Date.now()));
    return true;
  } catch { return true; } // storage unavailable -- fail open, don't block the log
}

// Fire-and-forget, deduplicated. `targetId` (when given) scopes the dedup
// key to that specific target (e.g. one listing, one portfolio item) so
// engaging with two different listings from the same creator both count,
// while re-clicking the same one within the window doesn't.
export function logProfileEngagement(
  creatorId: string, action: ProfileEngagementAction, actorId?: string, targetId?: string,
): void {
  if (!creatorId) return;
  const key = `${action}:${creatorId}:${targetId ?? ''}`;
  if (!shouldLog(key)) return;
  supabase.from('profile_engagement_events').insert({
    creator_id: creatorId, actor_id: actorId || null, action, target_id: targetId || null,
  }).then(() => {}, () => {});
}

// Passive profile-page visit -- never counted toward Profile Interaction
// (see profile_views table's own comment). Own dedup key/window so a
// refresh or quick back-and-forth doesn't inflate it either.
export function logProfileView(creatorId: string, viewerId?: string): void {
  if (!creatorId) return;
  if (!shouldLog(`profile_view:${creatorId}`)) return;
  supabase.from('profile_views').insert({ creator_id: creatorId, viewer_id: viewerId || null }).then(() => {}, () => {});
}

export interface ProfileInteractionStats {
  total: number;
  totalChangePct: number | null;
}

function pctChange(curr: number, prev: number): number | null {
  if (prev <= 0) return null;
  return Math.round(((curr - prev) / prev) * 100);
}

// Last 30 days vs the 30 days before that -- ONE combined number, summed
// across portfolio_engagement_events (view/like/comment/share on a
// specific item -- "portfolio item open" in the spec's list maps to
// 'view') AND this file's own profile_engagement_events (everything else:
// follow, message, saves, View Portfolio clicks, Service/Listing opens,
// profile shares, recommendations, social-link clicks). Never four (or
// fourteen) separately-computed percentages averaged together -- the
// trend compares the two SUMS directly.
export async function getProfileInteractionStats(creatorId: string): Promise<ProfileInteractionStats> {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const currStart = new Date(now - 30 * dayMs).toISOString();
  const prevStart = new Date(now - 60 * dayMs).toISOString();

  const countTable = async (table: string, from: string, to?: string) => {
    let q = supabase.from(table).select('id', { count: 'exact', head: true })
      .eq('creator_id', creatorId).gte('created_at', from);
    if (to) q = q.lt('created_at', to);
    if (table === 'portfolio_engagement_events') q = q.in('action', ['view', 'like', 'comment', 'share']);
    const { count } = await q;
    return count ?? 0;
  };

  const [currPortfolio, currProfile, prevPortfolio, prevProfile] = await Promise.all([
    countTable('portfolio_engagement_events', currStart),
    countTable('profile_engagement_events', currStart),
    countTable('portfolio_engagement_events', prevStart, currStart),
    countTable('profile_engagement_events', prevStart, currStart),
  ]);

  const currTotal = currPortfolio + currProfile;
  const prevTotal = prevPortfolio + prevProfile;

  return { total: currTotal, totalChangePct: pctChange(currTotal, prevTotal) };
}
