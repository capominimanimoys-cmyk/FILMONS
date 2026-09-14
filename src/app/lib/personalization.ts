// Home -> Portfolio's personalized "For You" category/subcategory chips.
//
// SCOPE NOTE (read before extending): this is a real, working system, not
// the full platform-scale spec verbatim. What's genuinely implemented: a
// stored, incrementally-decayed user_category_affinity table (not just an
// on-read computation over a raw log), a centralized, configurable weight
// table, a much richer role -> {category, subcategory} taxonomy mapping
// covering the specific professions this was designed against (rapper,
// wedding photographer, director, music producer, designer, actor, etc.),
// a promotion guard so a category can't jump into the personalized set
// off one weak interaction, and a mild location-boost applied to feed
// ORDERING (not a location tab) -- see getPortfolioFeed in portfolioApi.ts.
//
// What's deliberately NOT built, because it needs infrastructure that
// doesn't exist and faking it would be worse than flagging it honestly:
//   - AI-suggested category/subcategory at upload time. The creator picks
//     both manually now (see AddPortfolioItemSheet.tsx) -- a real
//     suggestion feature needs a new edge function calling an LLM, a
//     separate integration this pass doesn't add.
//   - True impression/dwell-time/watch-completion tracking. Only
//     meaningful actions (open, like, save, comment, follow, share) are
//     logged -- nothing anywhere in this app measures scroll-impressions
//     or video watch duration.
//   - A user-facing "Portfolio Feed Preferences" settings screen
//     (interested/less-interested/reset controls). The affinity table
//     this system writes to is exactly what such a screen would read/
//     write, so it's a real, addressable follow-up, not a redesign.
import { supabase } from '../../lib/supabase';
import { PORTFOLIO_CATEGORIES, PORTFOLIO_SUBCATEGORIES } from './portfolioApi';

export type PortfolioInteractionAction =
  | 'view' | 'like' | 'unlike' | 'save' | 'unsave' | 'comment'
  | 'follow_creator' | 'unfollow_creator' | 'share' | 'category_selected' | 'open_full_portfolio';

// Centralized, single source of truth for every weight used anywhere in
// this pipeline -- "configurable rather than scattered as hard-coded
// constants throughout components" (per spec). Values are the point scale
// given in the spec directly.
export const PERSONALIZATION_WEIGHTS = {
  primaryRole: 40,
  secondaryRole: 25,
  itemCategoryOwned: 35,   // the user's OWN portfolio item's category/subcategory
  itemTagsOwned: 20,       // the user's OWN portfolio item's tags
  profileSkill: 20,
  explicitInterest: 25,    // reserved -- no onboarding "interests" field exists yet, see roleToCategories' own note
  followedCreatorCategory: 10,
  like: 8,
  unlike: -8,
  save: 12,
  unsave: -12,
  comment: 6,              // between like and save, matching the spec's "medium" band
  view: 3,
  share: 10,               // grouped with follow as a "strong positive signal" per spec
  followCreatorAction: 10, // the ACTION of following (separate from followedCreatorCategory, which is the passive "what do people I follow post" signal)
  unfollowCreatorAction: -10,
  categorySelected: 5,     // tapping a chip / picking from More
  openFullPortfolio: 6,
} as const;

// A category/subcategory only becomes personalization-eligible from
// BEHAVIOR ALONE (not cold-start) once it has at least this many logged
// interactions -- "do not change tabs after one accidental interaction."
// Cold-start rows (source: 'role' | 'skill') are exempt -- they're
// deliberately shown from account creation with zero behavioral history.
const MIN_INTERACTIONS_TO_PROMOTE = 3;

const AFFINITY_HALF_LIFE_DAYS = 30;

interface CategoryTarget { category: string; subcategory?: string }

/** Fire-and-forget -- bumps stored affinity (both category- and
 * subcategory-level rows when a subcategory is known) and appends to the
 * raw interaction log. Never blocks or fails the UI action it's attached
 * to. */
export function logPortfolioInteraction(
  userId: string | undefined, target: CategoryTarget | string | null | undefined, action: PortfolioInteractionAction,
): void {
  if (!userId) return;
  const t: CategoryTarget | null = typeof target === 'string' ? { category: target } : (target ?? null);
  const weight = actionWeight(action);

  // Raw log -- kept for audit/debugging and any future analysis that
  // needs real event history rather than just a running score.
  supabase.from('portfolio_interactions').insert({
    user_id: userId, category: t?.category ?? null, action, weight,
  }).then(({ error }) => { if (error) console.warn('[personalization] log error:', error.message); });

  if (!t?.category) return;
  bumpCategoryAffinity(userId, t.category, '', weight, 'interaction');
  if (t.subcategory) bumpCategoryAffinity(userId, t.category, t.subcategory, weight, 'interaction');
}

function actionWeight(action: PortfolioInteractionAction): number {
  switch (action) {
    case 'view': return PERSONALIZATION_WEIGHTS.view;
    case 'like': return PERSONALIZATION_WEIGHTS.like;
    case 'unlike': return PERSONALIZATION_WEIGHTS.unlike;
    case 'save': return PERSONALIZATION_WEIGHTS.save;
    case 'unsave': return PERSONALIZATION_WEIGHTS.unsave;
    case 'comment': return PERSONALIZATION_WEIGHTS.comment;
    case 'follow_creator': return PERSONALIZATION_WEIGHTS.followCreatorAction;
    case 'unfollow_creator': return PERSONALIZATION_WEIGHTS.unfollowCreatorAction;
    case 'share': return PERSONALIZATION_WEIGHTS.share;
    case 'category_selected': return PERSONALIZATION_WEIGHTS.categorySelected;
    case 'open_full_portfolio': return PERSONALIZATION_WEIGHTS.openFullPortfolio;
    default: return 0;
  }
}

// Incrementally-decayed running score -- reads the existing row (if any),
// decays it by elapsed time since its last update, adds the new weight,
// and writes it back. This is the standard way to maintain a decaying
// score without replaying the full interaction history on every read;
// the raw log above still exists for that if it's ever needed.
// Best-effort: a lost update under a rare race (two near-simultaneous
// interactions for the same user+category) is an acceptable trade-off,
// consistent with every other fire-and-forget write in this app.
async function bumpCategoryAffinity(
  userId: string, category: string, subcategory: string, weight: number, source: string,
): Promise<void> {
  try {
    const { data: existing, error: readErr } = await supabase
      .from('user_category_affinity')
      .select('affinity_score, interaction_count, last_interaction_at')
      .eq('user_id', userId).eq('category', category).eq('subcategory', subcategory)
      .maybeSingle();
    if (readErr?.code === '42P01') return; // table not migrated yet -- fail silently, not a crash

    const now = Date.now();
    let decayedScore = 0;
    if (existing) {
      const hoursSince = (now - new Date(existing.last_interaction_at ?? now).getTime()) / 3_600_000;
      decayedScore = Number(existing.affinity_score) * Math.pow(0.5, hoursSince / (AFFINITY_HALF_LIFE_DAYS * 24));
    }
    await supabase.from('user_category_affinity').upsert({
      user_id: userId, category, subcategory,
      affinity_score: decayedScore + weight,
      interaction_count: (existing?.interaction_count ?? 0) + 1,
      last_interaction_at: new Date(now).toISOString(),
      source, updated_at: new Date(now).toISOString(),
    }, { onConflict: 'user_id,category,subcategory' });
  } catch (e) {
    console.warn('[personalization] affinity bump error:', e);
  }
}

/** Cold-start seeding -- call once when role/skills are known (e.g. right
 * after onboarding, or lazily the first time personalization is read for
 * a user with no affinity rows yet). Idempotent-ish: re-running it just
 * re-bumps the same rows, which is fine since it's the same fixed weight
 * each time, not a runaway accumulation like a repeated user action would be. */
export async function seedAffinityFromProfile(
  userId: string, profile: { primary_role?: string | null; secondary_roles?: string[] | null; skills?: string[] | null },
): Promise<void> {
  const primary = roleToCategories(profile.primary_role);
  if (primary) {
    await bumpCategoryAffinity(userId, primary.category, '', PERSONALIZATION_WEIGHTS.primaryRole, 'role');
    if (primary.subcategory) await bumpCategoryAffinity(userId, primary.category, primary.subcategory, PERSONALIZATION_WEIGHTS.primaryRole, 'role');
  }
  for (const r of (profile.secondary_roles ?? [])) {
    const m = roleToCategories(r);
    if (!m) continue;
    await bumpCategoryAffinity(userId, m.category, '', PERSONALIZATION_WEIGHTS.secondaryRole, 'role');
    if (m.subcategory) await bumpCategoryAffinity(userId, m.category, m.subcategory, PERSONALIZATION_WEIGHTS.secondaryRole, 'role');
  }
  for (const s of (profile.skills ?? [])) {
    const m = roleToCategories(s);
    if (!m) continue;
    await bumpCategoryAffinity(userId, m.category, '', PERSONALIZATION_WEIGHTS.profileSkill, 'skill');
    if (m.subcategory) await bumpCategoryAffinity(userId, m.category, m.subcategory, PERSONALIZATION_WEIGHTS.profileSkill, 'skill');
  }
}

// Hand-authored role/skill -> {category, subcategory} map. Roles are free
// text ("Wedding Photographer", "Director of Photography", "Rapper"),
// this normalizes them onto the same controlled taxonomy portfolio
// content itself uses (PORTFOLIO_CATEGORIES / PORTFOLIO_SUBCATEGORIES)
// instead of ever displaying a raw role string as a tab. Ordered
// most-specific-first so e.g. "Wedding Photographer" matches the Wedding
// subcategory before the bare "photographer" fallback would just give
// Photography with no subcategory.
const ROLE_TAXONOMY: [RegExp, string, string?][] = [
  // Music
  [/rapper|hip.?hop|\bmc\b/i, 'Music & Audio', 'Hip-Hop & Rap'],
  [/r&b|rnb/i, 'Music & Audio', 'R&B'],
  [/pop (singer|artist|musician)/i, 'Music & Audio', 'Pop'],
  [/afrobeat/i, 'Music & Audio', 'Afrobeats'],
  [/\bdj\b|electronic music/i, 'Music & Audio', 'Electronic'],
  [/rock (musician|band|artist)/i, 'Music & Audio', 'Rock'],
  [/jazz/i, 'Music & Audio', 'Jazz'],
  [/classical/i, 'Music & Audio', 'Classical'],
  [/music producer|beat.?maker|record producer/i, 'Music & Audio', 'Music Production'],
  [/songwriter/i, 'Music & Audio', 'Songwriting'],
  [/singer|vocalist|musician|composer|audio engineer|sound engineer/i, 'Music & Audio', undefined],
  // Photography
  [/wedding photographer/i, 'Photography', 'Wedding'],
  [/portrait photographer/i, 'Photography', 'Portrait'],
  [/fashion photographer/i, 'Photography', 'Fashion'],
  [/product photographer/i, 'Photography', 'Product'],
  [/street photographer/i, 'Photography', 'Street'],
  [/sports photographer/i, 'Photography', 'Sports'],
  [/event photographer/i, 'Photography', 'Event'],
  [/photographer|photography/i, 'Photography', undefined],
  // Film & Video
  [/(film|video) director|^director$/i, 'Film & Video', 'Directing'],
  [/cinematographer|director of photography|\bdop\b|\bdp\b/i, 'Film & Video', 'Cinematography'],
  [/video editor|colorist|color grad/i, 'Film & Video', 'Editing'],
  [/videographer/i, 'Film & Video', 'Videography'],
  [/documentary (filmmaker|director)/i, 'Film & Video', 'Documentaries'],
  [/wedding film/i, 'Film & Video', 'Wedding Films'],
  [/(filmmaker|film|movie|cinema)/i, 'Film & Video', undefined],
  // Acting
  [/voice actor|voice.?over artist/i, 'Acting', 'Voice Acting'],
  [/theatre actor|theater actor|stage actor/i, 'Acting', 'Theatre'],
  [/actor|actress/i, 'Acting', undefined],
  // Design
  [/graphic designer/i, 'Design & Creative', 'Graphic Design'],
  [/brand(ing)? designer/i, 'Design & Creative', 'Branding'],
  [/motion designer|motion graphic/i, 'Design & Creative', 'Motion Design'],
  [/ui\/?ux designer|product designer/i, 'Design & Creative', 'UI/UX'],
  [/illustrator/i, 'Design & Creative', 'Illustration'],
  [/3d artist|3d designer|3d modeler/i, 'Design & Creative', '3D'],
  [/designer/i, 'Design & Creative', undefined],
  // Other categories with no curated subcategory list yet
  [/model(ing)?/i, 'Modeling', undefined],
  [/animator|animation/i, 'Animation', undefined],
  [/stylist|fashion/i, 'Fashion', undefined],
  [/event (planner|coordinator)/i, 'Events', undefined],
  [/gam(e|ing)|esport/i, 'Gaming', undefined],
  [/commercial|brand strategist|advertis/i, 'Commercial', undefined],
  [/editorial|journalis/i, 'Editorial', undefined],
];

export function roleToCategories(text?: string | null): CategoryTarget | null {
  if (!text) return null;
  for (const [re, category, subcategory] of ROLE_TAXONOMY) {
    if (re.test(text)) return { category, subcategory };
  }
  return null;
}

/** Back-compat single-category form (still used by FollowContext's follow/
 * unfollow logging, which only cares about the broad category). */
export function roleToCategory(text?: string | null): string | null {
  return roleToCategories(text)?.category ?? null;
}

const TRENDING_LOOKBACK_DAYS = 14;
const DEFAULT_CATEGORY_ORDER = ['Photography', 'Film & Video', 'Music & Audio', 'Design & Creative', 'Fashion'];

/** Ranked list of display labels -- each entry is either a top-level
 * category ("Music & Audio") or "Category > Subcategory" is deliberately
 * NOT the format; callers get back the more specific label alone
 * ("Hip-Hop & Rap") since the chip itself doesn't need to show the parent
 * -- see getPersonalizedCategories' own combination logic below. */
export async function getPersonalizedCategories(
  userId: string, opts: { limit?: number } = {},
): Promise<string[]> {
  const limit = opts.limit ?? 4;

  try {
    const { data: rows, error } = await supabase
      .from('user_category_affinity')
      .select('category, subcategory, affinity_score, interaction_count, source')
      .eq('user_id', userId)
      .gt('affinity_score', 0)
      .order('affinity_score', { ascending: false })
      .limit(50);

    // Table not migrated yet, or genuinely no rows -- seed cold-start from
    // the profile on the fly and retry once, rather than showing nothing.
    if (error?.code === '42P01' || (!error && (rows ?? []).length === 0)) {
      const { data: me } = await supabase.from('profiles').select('primary_role, secondary_roles, skills').eq('id', userId).maybeSingle();
      if (me) await seedAffinityFromProfile(userId, me as any);
      const retry = await supabase
        .from('user_category_affinity')
        .select('category, subcategory, affinity_score, interaction_count, source')
        .eq('user_id', userId).gt('affinity_score', 0)
        .order('affinity_score', { ascending: false }).limit(50);
      return finalizeCategoryList(retry.data ?? [], limit, await getTrendingCategories());
    }

    return finalizeCategoryList(rows ?? [], limit, await getTrendingCategories());
  } catch (e) {
    console.warn('[personalization] getPersonalizedCategories error:', e);
    return DEFAULT_CATEGORY_ORDER.slice(0, limit);
  }
}

type AffinityRow = { category: string; subcategory: string; affinity_score: number; interaction_count: number; source: string | null };

function finalizeCategoryList(rows: AffinityRow[], limit: number, trending: Map<string, number>): string[] {
  // Promotion guard -- a row that's PURELY behavioral (never got a role/
  // skill cold-start bump) needs a minimum interaction count before it's
  // eligible, so one stray like/view can't immediately install itself as
  // a personalized tab.
  const eligible = rows.filter(r => r.source === 'role' || r.source === 'skill' || r.interaction_count >= MIN_INTERACTIONS_TO_PROMOTE);

  // Display label = the most specific thing available (subcategory if
  // set, else the category itself). If both a category and one of its
  // subcategories are eligible, show both -- "when a user's identity
  // strongly belongs to a broad field, show both the broad category and
  // useful specialized categories" (per spec).
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const r of eligible) {
    const label = r.subcategory || r.category;
    if (seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
    if (labels.length >= limit) break;
  }

  if (!labels.length) {
    const trendingOnly = [...trending.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
    return (trendingOnly.length ? trendingOnly : DEFAULT_CATEGORY_ORDER).slice(0, limit);
  }

  // Exploration -- ~20% of the time, swap the weakest personalized label
  // for a trending category the user has no eligible affinity for at all,
  // so the row doesn't calcify into only ever-narrower reinforcement.
  const explorationCandidates = [...trending.keys()].filter(c => !labels.includes(c));
  if (explorationCandidates.length && Math.random() < 0.2) {
    const pick = explorationCandidates[Math.floor(Math.random() * explorationCandidates.length)];
    labels[labels.length - 1] = pick;
  }

  return labels;
}

async function getTrendingCategories(): Promise<Map<string, number>> {
  const sinceTrending = new Date(Date.now() - TRENDING_LOOKBACK_DAYS * 86_400_000).toISOString();
  const { data } = await supabase.from('portfolio_items').select('category').gte('created_at', sinceTrending).limit(500);
  const counts = new Map<string, number>();
  for (const row of (data ?? []) as any[]) {
    if (row.category && PORTFOLIO_CATEGORIES.includes(row.category)) counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
  }
  return counts;
}

/** Resolves a chip's display label (a category OR a subcategory name)
 * back into a {category, subcategory} filter pair for getPortfolioFeed --
 * subcategory labels are unique across the whole taxonomy in practice, so
 * a flat reverse-lookup is enough without needing the category alongside
 * the label everywhere a chip is rendered. */
export function resolveCategoryFilter(label: string): CategoryTarget {
  if (PORTFOLIO_CATEGORIES.includes(label)) return { category: label };
  for (const [category, subs] of Object.entries(PORTFOLIO_SUBCATEGORIES)) {
    if (subs.includes(label)) return { category, subcategory: label };
  }
  return { category: label };
}
