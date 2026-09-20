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

export async function getTopHashtags(limit = 20): Promise<Hashtag[]> {
  const { data } = await supabase.from('hashtags').select('id, tag, post_count').order('post_count', { ascending: false }).limit(limit);
  return data ?? [];
}

export async function upsertHashtag(tag: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('upsert_hashtag', { p_tag: tag });
  if (error) { console.error('[hashtagsApi] upsert_hashtag:', error.message); return null; }
  return data as string;
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

export interface HashtagPost {
  id: string; authorId: string; authorName: string; authorAvatar: string | null; authorVerified: boolean;
  content: string; thumbnailUrl: string | null; createdAt: string;
}
export interface HashtagPortfolioEntry {
  id: string; type: 'item' | 'album'; creatorId: string; creatorName: string; creatorAvatar: string | null;
  title: string; thumbnailUrl: string | null;
}

export interface HashtagContent {
  posts: HashtagPost[];
  portfolio: HashtagPortfolioEntry[];
  courses: Course[];
}

/** Hashtag results page's content -- only content types FILMONS actually
 *  indexes hashtags for (see this file's indexContentHashtags/
 *  attachHashtagsToPost call sites), and only publicly-visible rows (this
 *  is a discovery page, not gated by follow/connection like a
 *  personalized feed). */
export async function getHashtagContent(tagInput: string, limit = 30): Promise<HashtagContent> {
  const tag = normalizeHashtag(tagInput);
  const { data: hashtagRow } = await supabase.from('hashtags').select('id').eq('tag', tag).maybeSingle();
  if (!hashtagRow) return { posts: [], portfolio: [], courses: [] };

  const { data: mentions } = await supabase.from('hashtag_mentions')
    .select('content_type, content_id, created_at')
    .eq('hashtag_id', hashtagRow.id)
    .order('created_at', { ascending: false })
    .limit(200);
  const rows = mentions ?? [];

  const idsFor = (type: HashtagContentType) => rows.filter(r => r.content_type === type).map(r => r.content_id);

  const [posts, items, albums, courses] = await Promise.all([
    fetchHashtagPosts(idsFor('post'), limit),
    fetchHashtagPortfolioItems(idsFor('portfolio_item'), limit),
    fetchHashtagPortfolioAlbums(idsFor('portfolio_album'), limit),
    getCoursesByIds(idsFor('course')),
  ]);

  return { posts, portfolio: [...items, ...albums], courses };
}

async function fetchHashtagPosts(ids: string[], limit: number): Promise<HashtagPost[]> {
  if (!ids.length) return [];
  const { data } = await supabase.from('posts')
    .select('id, author_id, content, media_urls, visibility, created_at')
    .in('id', ids).eq('visibility', 'public')
    .order('created_at', { ascending: false }).limit(limit);
  const rows = data ?? [];
  if (!rows.length) return [];
  const authorIds = [...new Set(rows.map((r: any) => r.author_id))];
  const { data: profiles } = await supabase.from('profiles').select('id, name, avatar_url, is_verified').in('id', authorIds);
  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
  return rows.map((r: any) => {
    const p = profileMap.get(r.author_id);
    const media = Array.isArray(r.media_urls) ? r.media_urls : [];
    return {
      id: r.id, authorId: r.author_id, authorName: p?.name ?? 'Filmons user', authorAvatar: p?.avatar_url ?? null,
      authorVerified: !!p?.is_verified, content: r.content ?? '', thumbnailUrl: media[0] ?? null, createdAt: r.created_at,
    };
  });
}

async function fetchHashtagPortfolioItems(ids: string[], limit: number): Promise<HashtagPortfolioEntry[]> {
  if (!ids.length) return [];
  const { data } = await supabase.from('portfolio_items')
    .select('id, user_id, title, media_url, thumbnail_url, visibility, created_at')
    .in('id', ids).order('created_at', { ascending: false }).limit(limit);
  const rows = (data ?? []).filter((r: any) => !r.visibility || r.visibility === 'public');
  return attachCreatorsToPortfolioRows(rows, 'item');
}

async function fetchHashtagPortfolioAlbums(ids: string[], limit: number): Promise<HashtagPortfolioEntry[]> {
  if (!ids.length) return [];
  const { data } = await supabase.from('portfolio_albums')
    .select('id, user_id, title, cover_url, visibility, created_at')
    .in('id', ids).order('created_at', { ascending: false }).limit(limit);
  const rows = (data ?? []).filter((r: any) => !r.visibility || r.visibility === 'public');
  return attachCreatorsToPortfolioRows(rows, 'album');
}

async function attachCreatorsToPortfolioRows(rows: any[], type: 'item' | 'album'): Promise<HashtagPortfolioEntry[]> {
  if (!rows.length) return [];
  const userIds = [...new Set(rows.map(r => r.user_id))];
  const { data: profiles } = await supabase.from('profiles').select('id, name, avatar_url').in('id', userIds);
  const map = new Map((profiles ?? []).map((p: any) => [p.id, p]));
  return rows.map(r => {
    const p = map.get(r.user_id);
    return {
      id: r.id, type, creatorId: r.user_id, creatorName: p?.name ?? 'Filmons user', creatorAvatar: p?.avatar_url ?? null,
      title: r.title, thumbnailUrl: r.thumbnail_url || r.media_url || r.cover_url || null,
    };
  });
}
