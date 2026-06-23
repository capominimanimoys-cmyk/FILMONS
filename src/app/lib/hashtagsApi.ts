/**
 * Filmons — Hashtags API
 * src/app/lib/hashtagsApi.ts
 */
import { supabase } from '../../lib/supabase';

export interface Hashtag {
  id:         string;
  tag:        string;
  post_count: number;
}

/** Search hashtags by prefix — returns up to 20, ordered by popularity */
export async function searchHashtags(query: string, limit = 20): Promise<Hashtag[]> {
  const clean = query.replace(/^#/, '').toLowerCase().trim();
  if (!clean) return getTopHashtags(limit);
  const { data, error } = await supabase.rpc('search_hashtags', { p_query: clean, p_limit: limit });
  if (error) { console.error(error); return []; }
  return data ?? [];
}

/** Top hashtags by post count (used when # is typed with no query yet) */
export async function getTopHashtags(limit = 20): Promise<Hashtag[]> {
  const { data } = await supabase
    .from('hashtags')
    .select('id, tag, post_count')
    .order('post_count', { ascending: false })
    .limit(limit);
  return data ?? [];
}

/** Upsert a hashtag and return its id */
export async function upsertHashtag(tag: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('upsert_hashtag', { p_tag: tag });
  if (error) { console.error(error); return null; }
  return data as string;
}

/** Associate a list of hashtag strings with a post (upserts + joins) */
export async function attachHashtagsToPost(postId: string, tags: string[]): Promise<void> {
  if (!tags.length) return;
  // Upsert all hashtags in parallel
  const ids = await Promise.all(tags.map(t => upsertHashtag(t)));
  const valid = ids.filter(Boolean) as string[];
  if (!valid.length) return;
  // Insert join rows (ignore duplicates)
  await supabase.from('post_hashtags').upsert(
    valid.map(hid => ({ post_id: postId, hashtag_id: hid })),
    { onConflict: 'post_id,hashtag_id', ignoreDuplicates: true }
  );
}