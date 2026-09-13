// Home -> Portfolio's personalized "For You" category chips.
//
// SCOPE NOTE (read before extending): this is a real, working V1, not the
// full spec verbatim. What's genuinely implemented: weighted interaction
// logging with exponential time decay, cold-start from profile roles/
// skills, a followed-creators content-category signal, a trending
// fallback, and a small chip-level exploration slot. What's deliberately
// NOT built, because the infrastructure it would need doesn't exist and
// faking it would be worse than not having it:
//   - Fine-grained tag chips ("Cinematography", "Music Video", "BTS").
//     portfolio_items.category IS already a real, controlled taxonomy
//     (PORTFOLIO_CATEGORIES) -- chips here rank THAT, not free-text tags.
//     Normalizing arbitrary creator-entered tags into a sub-taxonomy is a
//     separate, real content-modeling task, not a personalization-math one.
//   - Dwell-time ("+2 for watching a while") -- nothing tracks watch
//     duration anywhere in this app; only view-open is logged (+1).
//   - "Repeatedly skip" (-1) -- there's no skip/dismiss gesture on
//     Portfolio content (that's the Listings swipe deck's own mechanic);
//     not applicable here.
//   - Blending exploration INTO the filtered feed's own results (e.g. 20%
//     of a category-filtered page being off-category). Exploration here
//     only affects which CHIPS are offered, not what a chip's own filtered
//     results contain once tapped.
import { supabase } from '../../lib/supabase';
import { PORTFOLIO_CATEGORIES } from './portfolioApi';

export type PortfolioInteractionAction =
  | 'view' | 'like' | 'unlike' | 'save' | 'unsave' | 'comment'
  | 'follow_creator' | 'unfollow_creator' | 'share';

// Matches the point values given in the spec directly -- these ARE the
// per-action signal, not a separate "20% for likes/saves/comments" figure
// layered on top of them (that 20/25/30/15/10 split describes signal
// CATEGORIES, which these action weights already encode: view carries the
// 30% "content viewed" band, follow_creator the 25% "who they follow"
// band, like/save/comment/share the 20% engagement band).
const INTERACTION_WEIGHTS: Record<PortfolioInteractionAction, number> = {
  view: 1, like: 3, unlike: -3, save: 4, unsave: -4, comment: 3,
  follow_creator: 5, unfollow_creator: -5, share: 5,
};

/** Fire-and-forget -- never blocks or fails the UI action it's attached to. */
export function logPortfolioInteraction(
  userId: string | undefined, category: string | null | undefined, action: PortfolioInteractionAction,
): void {
  if (!userId) return;
  supabase.from('portfolio_interactions').insert({
    user_id: userId, category: category ?? null, action, weight: INTERACTION_WEIGHTS[action],
  }).then(({ error }) => { if (error) console.warn('[personalization] log error:', error.message); });
}

// Small, hand-authored keyword map -- roles/skills are free text ("Director
// of Photography", "Wedding Photographer", "Hip-Hop Producer"), this maps
// them onto the same controlled PORTFOLIO_CATEGORIES taxonomy portfolio
// content itself already uses, rather than treating every distinct role
// string as its own category.
const ROLE_KEYWORD_TO_CATEGORY: [RegExp, string][] = [
  [/model/i, 'Modeling'],
  [/(video|film|cinemat|director|documentar|editor)/i, 'Film & Video'],
  [/(music|audio|sound|producer|dj\b|composer|singer|rapper)/i, 'Music & Audio'],
  [/(design|graphic|illustrat|animat|motion)/i, 'Design & Creative'],
  [/(fashion|styl)/i, 'Fashion'],
  [/(game|gaming|esport)/i, 'Gaming'],
  [/(commercial|brand|advertis)/i, 'Commercial'],
  [/editorial/i, 'Editorial'],
  [/photo/i, 'Photography'],
];
export function roleToCategory(text?: string | null): string | null {
  if (!text) return null;
  for (const [re, cat] of ROLE_KEYWORD_TO_CATEGORY) if (re.test(text)) return cat;
  return null;
}

const DECAY_HALF_LIFE_DAYS = 30;
const LOOKBACK_DAYS = 180; // "six months ago shouldn't permanently dominate" -- don't even fetch further back than that
const TRENDING_LOOKBACK_DAYS = 14;

function decayedWeight(weight: number, createdAt: string): number {
  const ageDays = (Date.now() - new Date(createdAt).getTime()) / 86_400_000;
  return weight * Math.pow(0.5, ageDays / DECAY_HALF_LIFE_DAYS);
}

// Sensible, fixed fallback for a brand-new account with zero signal of any
// kind (no interactions, no follows, no role/skills set, even trending
// empty) -- the chip row must never be empty.
const DEFAULT_CATEGORY_ORDER = ['Photography', 'Film & Video', 'Music & Audio', 'Design & Creative', 'Fashion'];

export async function getPersonalizedCategories(
  userId: string, opts: { limit?: number } = {},
): Promise<string[]> {
  const limit = opts.limit ?? 6;
  const scores = new Map<string, number>();
  const bump = (category: string | null | undefined, amount: number) => {
    if (!category || !PORTFOLIO_CATEGORIES.includes(category)) return;
    scores.set(category, (scores.get(category) ?? 0) + amount);
  };

  try {
    const sinceLookback = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();
    const sinceTrending = new Date(Date.now() - TRENDING_LOOKBACK_DAYS * 86_400_000).toISOString();

    const [meRes, interactionRes, followingRes, trendingRes] = await Promise.all([
      supabase.from('profiles').select('primary_role, secondary_roles, skills').eq('id', userId).maybeSingle(),
      supabase.from('portfolio_interactions').select('category, weight, created_at').eq('user_id', userId).gte('created_at', sinceLookback),
      supabase.from('follows').select('following_id').eq('follower_id', userId),
      supabase.from('portfolio_items').select('category').gte('created_at', sinceTrending).limit(500),
    ]);

    // 1) Own roles/skills -- cold-start signal, always applied (not just
    // for brand-new accounts) since a user's stated interests stay
    // relevant even once behavioral data exists, just at lower weight.
    const me = meRes.data as any;
    if (me) {
      bump(roleToCategory(me.primary_role), 6);
      for (const r of (me.secondary_roles ?? [])) bump(roleToCategory(r), 3);
      for (const s of (me.skills ?? [])) bump(roleToCategory(s), 2);
    }

    // 2) Behavioral interactions -- the dominant signal once it exists,
    // decayed so old activity fades rather than permanently dominating.
    for (const row of (interactionRes.data ?? []) as any[]) {
      bump(row.category, decayedWeight(row.weight, row.created_at));
    }

    // 3) Followed creators' own content categories -- "what do people I
    // follow actually make", independent of whether THIS user has
    // personally interacted with that category yet.
    const followingIds = (followingRes.data ?? []).map((r: any) => r.following_id);
    if (followingIds.length) {
      const { data: followedItems } = await supabase
        .from('portfolio_items').select('category').in('user_id', followingIds).limit(500);
      for (const row of (followedItems ?? []) as any[]) bump(row.category, 2);
    }

    // 4) Trending -- small weight, mainly a cold-start/empty-history
    // fallback rather than a real driver once personal signal exists.
    const trendingCounts = new Map<string, number>();
    for (const row of (trendingRes.data ?? []) as any[]) {
      if (row.category) trendingCounts.set(row.category, (trendingCounts.get(row.category) ?? 0) + 1);
    }
    for (const [category, count] of trendingCounts) bump(category, Math.min(count, 10) * 0.3);

    let ranked = [...scores.entries()].filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).map(([c]) => c);

    if (!ranked.length) {
      // Truly nothing to go on -- trending-only, else the fixed default.
      ranked = [...trendingCounts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
      if (!ranked.length) ranked = DEFAULT_CATEGORY_ORDER;
    }

    let top = ranked.slice(0, limit);

    // Exploration -- ~20% of the time, swap the weakest selected chip for a
    // trending category the user hasn't already earned a spot for
    // personally, so the row doesn't calcify into only ever-narrower
    // reinforcement of the same few categories.
    const explorationCandidates = [...trendingCounts.keys()].filter(c => !top.includes(c));
    if (explorationCandidates.length && Math.random() < 0.2) {
      const pick = explorationCandidates[Math.floor(Math.random() * explorationCandidates.length)];
      top = [...top.slice(0, -1), pick];
    }

    return top;
  } catch (e) {
    console.warn('[personalization] getPersonalizedCategories error:', e);
    return DEFAULT_CATEGORY_ORDER.slice(0, limit);
  }
}
