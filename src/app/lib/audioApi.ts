/**
 * Filmons — Audio Library API
 * src/app/lib/audioApi.ts
 */
import { supabase } from '../../lib/supabase';

export interface AudioTrack {
  id:           string;
  title:        string;
  artist?:      string;
  artwork_url?: string;
  duration_sec?: number;
  category?:   string;
  use_count:   number;
  is_trending: boolean;
  file_url?:   string;
  source?:     string;
}

export interface PostAudioAttachment {
  track_id?:     string;
  title:         string;
  artist?:       string;
  artwork_url?:  string;
  snippet_start: number;
  snippet_end?:  number;
}

// ── Search audio tracks ────────────────────────────────────────────────────────
const AUDIO_CACHE_TTL = 5 * 60 * 1000; // 5 min

export async function searchAudio(query = '', category = '', limit = 30): Promise<AudioTrack[]> {
  const cacheKey = `filmons_audio_${query}_${category}_${limit}`;
  // Return cache instantly if fresh
  try {
    const raw = sessionStorage.getItem(cacheKey);
    if (raw) {
      const { data, ts } = JSON.parse(raw);
      if (Date.now() - ts < AUDIO_CACHE_TTL) return data;
    }
  } catch {}

  // Direct table query as fallback if RPC fails
  try {
    const { data, error } = await supabase.rpc('search_audio', {
      p_query: query, p_category: category, p_limit: limit,
    });
    if (!error && data) {
      try { sessionStorage.setItem(cacheKey, JSON.stringify({ data, ts: Date.now() })); } catch {}
      return data as AudioTrack[];
    }
  } catch {}

  // Fallback: direct table query
  let q = supabase.from('audio_tracks')
    .select('id, title, artist, artwork_url, duration_sec, use_count, is_trending, file_url, category, creator_id, copyright_status')
    .eq('copyright_status', 'approved')
    .order('use_count', { ascending: false })
    .limit(limit);
  if (query) q = q.ilike('title', `%${query}%`);
  if (category) q = q.eq('category', category);
  const { data: rows } = await q;
  const result = (rows ?? []) as AudioTrack[];
  try { sessionStorage.setItem(cacheKey, JSON.stringify({ data: result, ts: Date.now() })); } catch {}
  return result;
}

export async function getTrending(limit = 20): Promise<AudioTrack[]> {
  return searchAudio('', '', limit);
}

// ── Saved sounds ────────────────────────────────────────────────────────────────
export async function getSavedSounds(userId: string): Promise<AudioTrack[]> {
  const cacheKey = `filmons_saved_sounds_${userId}`;
  // Show cache instantly
  let cached: AudioTrack[] = [];
  try {
    const raw = localStorage.getItem(cacheKey);
    if (raw) cached = JSON.parse(raw);
  } catch {}

  // Refresh in background
  supabase.from('saved_sounds')
    .select('audio_tracks(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .then(({ data }) => {
      const fresh = (data ?? []).map((r: any) => r.audio_tracks).filter(Boolean) as AudioTrack[];
      try { localStorage.setItem(cacheKey, JSON.stringify(fresh)); } catch {}
    });

  return cached;
}

export async function toggleSaveSound(userId: string, trackId: string): Promise<boolean> {
  const { data } = await supabase
    .from('saved_sounds')
    .select('user_id')
    .eq('user_id', userId)
    .eq('track_id', trackId)
    .single();
  if (data) {
    await supabase.from('saved_sounds').delete().eq('user_id', userId).eq('track_id', trackId);
    return false;
  } else {
    await supabase.from('saved_sounds').insert({ user_id: userId, track_id: trackId });
    return true;
  }
}

// ── Audio from posts ────────────────────────────────────────────────────────────
export async function getPostsUsingAudio(trackId: string, limit = 20) {
  const { data } = await supabase
    .from('post_audio')
    .select('post_id, posts(id, caption, user_id)')
    .eq('track_id', trackId)
    .limit(limit);
  return data ?? [];
}

// ── Attach audio to post after publish ────────────────────────────────────────
export async function attachAudioToPost(postId: string, audio: PostAudioAttachment): Promise<void> {
  await supabase.from('post_audio').upsert({
    post_id:       postId,
    track_id:      audio.track_id ?? null,
    title:         audio.title,
    artist:        audio.artist ?? null,
    artwork_url:   audio.artwork_url ?? null,
    snippet_start: audio.snippet_start,
    snippet_end:   audio.snippet_end ?? null,
  }, { onConflict: 'post_id' });
}

// ── Format duration ────────────────────────────────────────────────────────────
export function fmtDuration(sec?: number): string {
  if (!sec) return '—';
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${s.toString().padStart(2,'0')}`;
}

// ── Create audio asset from a post (original audio) ───────────────────────────
export async function createAudioFromPost(
  postId:    string,
  title:     string,
  artist?:   string,
  creatorId?: string,
  audioType: string = 'music',
  artworkUrl?: string,
  fileUrl?:   string,
): Promise<string | null> {
  const { data, error } = await supabase.rpc('create_audio_from_post', {
    p_post_id:     postId,
    p_title:       title,
    p_artist:      artist      ?? null,
    p_creator_id:  creatorId   ?? null,
    p_audio_type:  audioType,
    p_artwork_url: artworkUrl  ?? null,
    p_file_url:    fileUrl     ?? null,
    p_waveform:    null,
  });
  if (error) { console.error(error); return null; }
  return data as string;
}

// ── Get audio analytics ────────────────────────────────────────────────────────
export async function getAudioAnalytics(trackId: string) {
  const { data } = await supabase.rpc('get_audio_page', { p_track_id: trackId });
  return data;
}

// ── Add credit to a track ─────────────────────────────────────────────────────
export async function addAudioCredit(
  trackId: string, role: string, name: string, userId?: string
): Promise<void> {
  await supabase.from('audio_credits').insert({
    track_id: trackId, role, name, user_id: userId ?? null,
  });
}