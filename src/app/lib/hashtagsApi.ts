// FILMONS Hashtags -- one shared index backing both compose-time hashtag
// suggestions (CreatePostSheet.tsx / PostComposer.tsx, pre-existing) and
// FILMONS Browse Search hashtag discovery (search suggestions,
// /search/category/hashtags, /hashtag/:tag -- new).
//
// Schema: hashtags(id, tag, post_count, last_used_at) + a generic
// hashtag_mentions(hashtag_id, content_type, content_id) join covering
// posts/portfolio items/portfolio albums/courses. post_count is trigger-
// synced from hashtag_mentions rows where content_type='post' specifically
// (that's what "#filmmaking · 234 posts" in the compose suggestion means).
// See supabase/migrations/20240518000000_hashtags.sql.
import { supabase } from '../../lib/supabase';
import { getCoursesByIds, type Course } from './coursesApi';
import { LISTING_COLUMNS, mapListingRow, postsApi } from './api';
import { getPortfolioEntriesByIds, getMutualConnectionsBatch, type PortfolioFeedEntry, type SuggestedCreator } from './portfolioApi';
import type { Listing, Post } from '../types';

const HASHTAG_RE = /#([a-zA-Z0-9_]+)/g;

export function normalizeHashtag(input: string): string {
  return input.trim().replace(/^#/, '').toLowerCase();
}

/** Every distinct hashtag in `text`, normalized + deduped, in first-seen order. */
export function extractHashtags(text: string | null | undefined): string[] {
  if (!text) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of text.matchAll(HASHTAG_RE)) {
    const tag = normalizeHashtag(m[1]);
    if (tag && !seen.has(tag)) { seen.add(tag); out.push(tag); }
  }
  return out;
}

// ── Pre-existing API, kept for CreatePostSheet.tsx/PostComposer.tsx -- same
// signatures/shapes, now backed by the tracked schema above instead of
// whatever untracked table/RPC may or may not have existed before. ────────

export interface Hashtag {
  id: string;
  tag: string;
  post_count: number;
}

/** Search hashtags by substring — up to `limit`, exact match first then by
 *  post_count. Used for the compose-time "#filmma..." suggestion list. */
export async function searchHashtags(query: string, limit = 20): Promise<Hashtag[]> {
  const clean = normalizeHashtag(query);
  if (!clean) return getTopHashtags(limit);
  const { data, error } = await supabase.rpc('search_hashtags', { p_query: clean, p_limit: limit });
  if (error) { console.error('[hashtagsApi] search_hashtags:', error.message); return []; }
  return data ?? [];
}

/** Real popular-hashtags fallback for the hashtag page's "no content yet"
 *  empty state -- same function the compose-time suggestion list already
 *  uses, never a fabricated list. */
export async function getTopHashtags(limit = 20): Promise<Hashtag[]> {
  const { data } = await supabase.from('hashtags').select('id, tag, post_count').order('post_count', { ascending: false }).limit(limit);
  return data ?? [];
}

/** Twitter-style "Trending" topics for Browse Search's Connect empty
 *  state -- the most-posted hashtags among those used in the last week
 *  (last_used_at bumps on every mention), falling back to the all-time
 *  top list when nothing was used recently. */
export async function getTrendingHashtags(limit = 5): Promise<Hashtag[]> {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data, error } = await supabase.from('hashtags').select('id, tag, post_count')
    .gte('last_used_at', since).gt('post_count', 0)
    .order('post_count', { ascending: false }).limit(limit);
  if (error) console.error('[hashtagsApi] getTrendingHashtags:', error.message);
  if (data?.length) return data;
  return getTopHashtags(limit);
}

export async function upsertHashtag(tag: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('upsert_hashtag', { p_tag: tag });
  if (error) { console.error('[hashtagsApi] upsert_hashtag:', error.message); return null; }
  return data as string;
}

// ── Follow #hashtag (supabase/migrations/20240609000000_hashtag_follows.sql)
// -- per spec, following becomes a personalization signal for Home/Connect/
// Marketplace/Learning, not just a bookmarking feature. ────────────────────

export async function isHashtagFollowed(userId: string, tagInput: string): Promise<boolean> {
  const hashtagId = await upsertHashtag(tagInput);
  if (!hashtagId) return false;
  const { data } = await supabase.from('hashtag_follows').select('id').eq('user_id', userId).eq('hashtag_id', hashtagId).maybeSingle();
  return !!data;
}

export async function followHashtag(userId: string, tagInput: string): Promise<void> {
  const hashtagId = await upsertHashtag(tagInput);
  if (!hashtagId) return;
  await supabase.from('hashtag_follows').upsert({ user_id: userId, hashtag_id: hashtagId }, { onConflict: 'user_id,hashtag_id', ignoreDuplicates: true });
}

export async function unfollowHashtag(userId: string, tagInput: string): Promise<void> {
  const tag = normalizeHashtag(tagInput);
  const { data: hashtagRow } = await supabase.from('hashtags').select('id').eq('tag', tag).maybeSingle();
  if (!hashtagRow) return;
  await supabase.from('hashtag_follows').delete().eq('user_id', userId).eq('hashtag_id', hashtagRow.id);
}

/** Most recently followed hashtag's tag -- drives the single "From
 *  hashtags you follow" discovery row (ProductDiscoveryGroups), same
 *  bounded one-signal approach the gear/skills rows already use rather
 *  than a full followed-hashtags feed. */
export async function getMostRecentFollowedHashtag(userId: string): Promise<string | null> {
  const { data } = await supabase.from('hashtag_follows').select('hashtags(tag)').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  return (data as any)?.hashtags?.tag ?? null;
}

export interface RelatedHashtag { tag: string; count: number }

/** Hashtags that co-occur with `tag` on the same content -- a lightweight
 *  co-occurrence count against the existing hashtag_mentions table, no
 *  new precomputed table. content_id is a uuid shared across every
 *  content type's own table, practically unique across them, so matching
 *  on it alone (without also pinning content_type) is safe here. */
export async function getRelatedHashtags(tagInput: string, limit = 10): Promise<RelatedHashtag[]> {
  const tag = normalizeHashtag(tagInput);
  const { data: hashtagRow } = await supabase.from('hashtags').select('id').eq('tag', tag).maybeSingle();
  if (!hashtagRow) return [];

  const { data: mentions } = await supabase.from('hashtag_mentions').select('content_id').eq('hashtag_id', hashtagRow.id).limit(200);
  const contentIds = [...new Set((mentions ?? []).map((r: any) => r.content_id))];
  if (!contentIds.length) return [];

  const { data: coMentions } = await supabase.from('hashtag_mentions').select('hashtag_id').in('content_id', contentIds).neq('hashtag_id', hashtagRow.id);
  const rows = coMentions ?? [];
  if (!rows.length) return [];

  const counts = new Map<string, number>();
  rows.forEach((r: any) => counts.set(r.hashtag_id, (counts.get(r.hashtag_id) ?? 0) + 1));
  const { data: hashtagRows } = await supabase.from('hashtags').select('id, tag').in('id', [...counts.keys()]);
  return (hashtagRows ?? [])
    .map((h: any) => ({ tag: h.tag, count: counts.get(h.id) ?? 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/** Associate hashtag strings (no '#') with a post -- called right after
 *  post creation by the composer. Delegates to the same generic indexer
 *  everything else uses, so a post's mentions live in ONE place
 *  (hashtag_mentions) rather than a posts-only side table. */
export async function attachHashtagsToPost(postId: string, tags: string[]): Promise<void> {
  await indexContentHashtagList('post', postId, tags);
}

// ── New: generic multi-content-type indexing + discovery, per the FILMONS
// Browse Search Hashtag Support spec. ──────────────────────────────────────

export type HashtagContentType = 'post' | 'portfolio_item' | 'portfolio_album' | 'course' | 'listing';

async function indexContentHashtagList(contentType: HashtagContentType, contentId: string, tags: string[]): Promise<void> {
  try {
    // Always clear this content's existing mentions first -- an edit that
    // removes a hashtag must remove it from that hashtag's results too,
    // not leave a stale mention forever.
    await supabase.from('hashtag_mentions').delete().eq('content_type', contentType).eq('content_id', contentId);
    const clean = [...new Set(tags.map(normalizeHashtag).filter(Boolean))];
    if (!clean.length) return;

    const { data: existing } = await supabase.from('hashtags').select('id, tag').in('tag', clean);
    const idByTag = new Map((existing ?? []).map((h: any) => [h.tag, h.id as string]));
    const missing = clean.filter(t => !idByTag.has(t));
    if (missing.length) {
      const { data: created } = await supabase.from('hashtags').insert(missing.map(tag => ({ tag }))).select('id, tag');
      (created ?? []).forEach((h: any) => idByTag.set(h.tag, h.id));
    }

    const mentions = clean.map(t => idByTag.get(t)).filter((id): id is string => !!id)
      .map(hashtag_id => ({ hashtag_id, content_type: contentType, content_id: contentId }));
    if (mentions.length) await supabase.from('hashtag_mentions').upsert(mentions, { onConflict: 'hashtag_id,content_type,content_id', ignoreDuplicates: true });
  } catch (e) {
    console.warn('[hashtagsApi] indexContentHashtagList failed:', e);
  }
}

/** Call after creating/editing any hashtag-bearing content whose hashtags
 *  live inline in free text (Portfolio title/description, course
 *  title/description, a post's own content -- extracted here rather than
 *  requiring the caller to pre-tokenize, unlike attachHashtagsToPost
 *  above, which the composer already tokenizes itself). Never blocks the
 *  actual content save on failure. */
export async function indexContentHashtags(contentType: HashtagContentType, contentId: string, text: string | null | undefined): Promise<void> {
  await indexContentHashtagList(contentType, contentId, extractHashtags(text));
}

export interface HashtagSuggestion {
  tag: string;
  usageCount: number;
}

/** Ranking per spec: exact match, then startsWith, then contains, ordered
 *  by usage/recency within each tier -- never sorted purely by popularity
 *  across the whole result set. Accepts either "filmmaking" or
 *  "#filmmaking". Distinct from searchHashtags() above (which returns the
 *  pre-existing Hashtag[]/post_count shape for the composer) -- this one
 *  powers Browse Search's cross-content-type hashtag discovery. */
export async function searchHashtagSuggestions(query: string, limit = 10): Promise<HashtagSuggestion[]> {
  const q = normalizeHashtag(query);
  if (!q) return [];
  const { data, error } = await supabase.from('hashtags').select('tag, post_count')
    .ilike('tag', `%${q}%`)
    .order('post_count', { ascending: false })
    .order('last_used_at', { ascending: false })
    .limit(50);
  if (error || !data?.length) return [];

  const tier = (tag: string) => tag === q ? 0 : tag.startsWith(q) ? 1 : 2;
  const ranked = [...data].sort((a: any, b: any) => tier(a.tag) - tier(b.tag) || b.post_count - a.post_count);
  return ranked.slice(0, limit).map((h: any) => ({ tag: h.tag, usageCount: h.post_count }));
}

export async function getHashtag(tagInput: string): Promise<HashtagSuggestion | null> {
  const tag = normalizeHashtag(tagInput);
  const { data } = await supabase.from('hashtags').select('tag, post_count').eq('tag', tag).maybeSingle();
  return data ? { tag: data.tag, usageCount: data.post_count } : null;
}

export interface HashtagContent {
  posts: Post[];
  portfolio: PortfolioFeedEntry[];
  courses: Course[];
  listings: Listing[];
}

/** Hashtag results page's content -- only content types FILMONS actually
 *  indexes hashtags for (see this file's indexContentHashtags/
 *  attachHashtagsToPost call sites), and only publicly-visible rows (this
 *  is a discovery page, not gated by follow/connection like a
 *  personalized feed).
 *
 *  Per the FILMONS Hashtag Page Flow's "IMPORTANT CARD RULE" -- this page
 *  must never invent its own lighter content shape, since every card is
 *  rendered through Home's own real components (PostCard,
 *  PortfolioProjectCard/PortfolioAlbumCard). So this returns the exact
 *  same hydrated Post[]/PortfolioFeedEntry[] those components already
 *  consume elsewhere (postsApi.getByIds, getPortfolioEntriesByIds), not a
 *  hashtag-specific summary row. */
export async function getHashtagContent(tagInput: string, limit = 30, viewerId?: string): Promise<HashtagContent> {
  const tag = normalizeHashtag(tagInput);
  const { data: hashtagRow } = await supabase.from('hashtags').select('id').eq('tag', tag).maybeSingle();
  if (!hashtagRow) return { posts: [], portfolio: [], courses: [], listings: [] };

  const { data: mentions } = await supabase.from('hashtag_mentions')
    .select('content_type, content_id, created_at')
    .eq('hashtag_id', hashtagRow.id)
    .order('created_at', { ascending: false })
    .limit(200);
  const rows = mentions ?? [];

  const idsFor = (type: HashtagContentType) => rows.filter(r => r.content_type === type).map(r => r.content_id);
  const postIds = idsFor('post').slice(0, limit);
  const itemIds = idsFor('portfolio_item').slice(0, limit);
  const albumIds = idsFor('portfolio_album').slice(0, limit);

  const [postsRaw, portfolioById, courses, listings] = await Promise.all([
    postsApi.getByIds(postIds),
    getPortfolioEntriesByIds(itemIds, albumIds, viewerId),
    getCoursesByIds(idsFor('course')),
    fetchHashtagListings(idsFor('listing'), limit),
  ]);

  // Neither getByIds nor getPortfolioEntriesByIds preserve input order --
  // re-sort back into the mention-recency order already computed above.
  const postOrder = new Map(postIds.map((id, i) => [id, i]));
  const posts = [...postsRaw].sort((a, b) => (postOrder.get(a.id) ?? 0) - (postOrder.get(b.id) ?? 0));
  const portfolio = [...itemIds, ...albumIds].map(id => portfolioById.get(id)).filter((e): e is PortfolioFeedEntry => !!e);

  return { posts, portfolio, courses, listings };
}

async function fetchHashtagListings(ids: string[], limit: number): Promise<Listing[]> {
  if (!ids.length) return [];
  const { data } = await supabase.from('listings').select(LISTING_COLUMNS)
    .in('id', ids).eq('is_active', true)
    .order('created_at', { ascending: false }).limit(limit);
  return (data ?? []).map(mapListingRow);
}

const CREATOR_PROFILE_COLUMNS = 'id, name, username, avatar_url, primary_role, business_industry, account_type, secondary_roles, city, is_verified, skills';

/** People tab -- creators/businesses who posted hashtagged content, in the
 *  exact SuggestedCreator shape SuggestedConnectionCard already renders
 *  (mutual connections included via the same batched helper Connect's own
 *  Profiles rows use), never a new profile card. hashtag_mentions has no
 *  author column of its own (confirmed against its schema), so this reads
 *  each content type's own author/creator column directly -- the same
 *  two-step content-then-author pattern getHashtagContent's own fetchers
 *  already use for Portfolio. */
export async function getHashtagCreators(tagInput: string, viewerId?: string, limit = 20): Promise<SuggestedCreator[]> {
  const tag = normalizeHashtag(tagInput);
  const { data: hashtagRow } = await supabase.from('hashtags').select('id').eq('tag', tag).maybeSingle();
  if (!hashtagRow) return [];

  const { data: mentions } = await supabase.from('hashtag_mentions')
    .select('content_type, content_id')
    .eq('hashtag_id', hashtagRow.id)
    .limit(400);
  const rows = mentions ?? [];
  const idsFor = (type: HashtagContentType) => rows.filter(r => r.content_type === type).map(r => r.content_id);

  const [postRows, itemRows, albumRows, courseRows, listingRows] = await Promise.all([
    idsFor('post').length ? supabase.from('posts').select('author_id').in('id', idsFor('post')).eq('visibility', 'public') : Promise.resolve({ data: [] as any[] }),
    idsFor('portfolio_item').length ? supabase.from('portfolio_items').select('user_id').in('id', idsFor('portfolio_item')) : Promise.resolve({ data: [] as any[] }),
    idsFor('portfolio_album').length ? supabase.from('portfolio_albums').select('user_id').in('id', idsFor('portfolio_album')).eq('visibility', 'public') : Promise.resolve({ data: [] as any[] }),
    idsFor('course').length ? supabase.from('courses').select('instructor_id').in('id', idsFor('course')) : Promise.resolve({ data: [] as any[] }),
    idsFor('listing').length ? supabase.from('listings').select('user_id').in('id', idsFor('listing')).eq('is_active', true) : Promise.resolve({ data: [] as any[] }),
  ]);
  const creatorIds = [...new Set([
    ...(postRows.data ?? []).map((r: any) => r.author_id),
    ...(itemRows.data ?? []).map((r: any) => r.user_id),
    ...(albumRows.data ?? []).map((r: any) => r.user_id),
    ...(courseRows.data ?? []).map((r: any) => r.instructor_id),
    ...(listingRows.data ?? []).map((r: any) => r.user_id),
  ])].filter((id): id is string => !!id && id !== viewerId);
  if (!creatorIds.length) return [];

  const [{ data: profiles }, mutuals] = await Promise.all([
    supabase.from('profiles').select(CREATOR_PROFILE_COLUMNS).in('id', creatorIds).not('name', 'is', null).limit(limit * 2),
    viewerId ? getMutualConnectionsBatch(viewerId, creatorIds) : Promise.resolve(new Map()),
  ]);

  const ranked = [...(profiles ?? [])].sort((a: any, b: any) =>
    (mutuals.get(b.id)?.count ?? 0) - (mutuals.get(a.id)?.count ?? 0) || (b.is_verified ? 1 : 0) - (a.is_verified ? 1 : 0));

  return ranked.slice(0, limit).map((p: any) => {
    const m = mutuals.get(p.id);
    return {
      id: p.id, name: p.name, username: p.username, avatar_url: p.avatar_url,
      primary_role: p.primary_role, business_industry: p.business_industry, account_type: p.account_type,
      secondary_roles: p.secondary_roles ?? [], city: p.city, is_verified: !!p.is_verified, skills: p.skills ?? [],
      mutualCount: m?.count ?? 0, mutualAvatars: m?.avatars ?? [],
    };
  });
}
