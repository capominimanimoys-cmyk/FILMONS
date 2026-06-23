/**
 * Filmons — Mentions API
 * src/app/lib/mentionsApi.ts
 */
import { supabase } from '../../lib/supabase';

export interface ProfileResult {
  id:           string;
  username:     string;
  display_name: string;
  avatar_url?:  string;
  account_type?: string;
}

/** Search profiles by name or username.
 *  Tries the search_profiles RPC first; falls back to a direct query
 *  so results always load even before the SQL migration is re-run. */
export async function searchProfiles(query: string, limit = 15): Promise<ProfileResult[]> {
  const q = query.replace(/^@/, '').trim();

  // Try RPC
  const { data, error } = await supabase.rpc('search_profiles', {
    p_query: q,
    p_limit: limit,
  });

  if (!error && data?.length) return data as ProfileResult[];

  // Direct fallback — always works, even without the RPC
  const builder = supabase
    .from('profiles')
    .select('id, name, username, avatar_url, account_type')
    .limit(limit);

  const { data: fallback } = q
    ? await builder.or(`name.ilike.%${q}%,username.ilike.%${q}%`)
    : await builder.order('name', { ascending: true });

  if (!fallback?.length) return [];

  return fallback.map((p: any) => ({
    id:           p.id,
    username:     p.username || (p.name || 'user').toLowerCase().replace(/\s+/g, ''),
    display_name: p.name || p.username || 'User',
    avatar_url:   p.avatar_url,
    account_type: p.account_type,
  }));
}

/** Attach mentioned user IDs to a post */
export async function attachMentionsToPost(postId: string, userIds: string[]): Promise<void> {
  if (!userIds.length) return;
  await supabase.from('post_mentions').upsert(
    userIds.map(uid => ({ post_id: postId, user_id: uid })),
    { onConflict: 'post_id,user_id', ignoreDuplicates: true }
  );
}