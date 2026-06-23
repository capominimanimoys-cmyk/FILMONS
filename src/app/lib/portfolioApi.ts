/**
 * Filmons — Portfolio API
 * CRUD for portfolio_items table.
 * Fails gracefully if the table doesn't exist yet.
 */
import { supabase } from '../../lib/supabase';

export type MediaType = 'image' | 'video' | 'audio' | 'link';

export interface PortfolioItem {
  id:            string;
  user_id:       string;
  title:         string;
  description?:  string;
  category:      string;
  role?:         string;
  year?:         number;
  media_type:    MediaType;
  media_url?:    string;
  thumbnail_url?: string;
  external_link?: string;
  is_featured:   boolean;
  created_at:    string;
}

export const PORTFOLIO_CATEGORIES = [
  'Film & Video',
  'Photography',
  'Modeling',
  'Gaming',
  'Music & Audio',
  'Design & Creative',
  'Other',
];

// ── Fetch ─────────────────────────────────────────────────────────────────────
export async function getPortfolioItems(userId: string): Promise<PortfolioItem[]> {
  try {
    const { data, error } = await supabase
      .from('portfolio_items')
      .select('*')
      .eq('user_id', userId)
      .order('is_featured', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) { console.warn('[portfolio] fetch error:', error.message); return []; }
    return (data ?? []) as PortfolioItem[];
  } catch { return []; }
}

// ── Create ────────────────────────────────────────────────────────────────────
export async function createPortfolioItem(
  userId: string,
  item: Omit<PortfolioItem, 'id' | 'user_id' | 'created_at'>,
): Promise<PortfolioItem | null> {
  const { data, error } = await supabase
    .from('portfolio_items')
    .insert({ ...item, user_id: userId })
    .select()
    .single();
  if (error) { console.error('[portfolio] create error:', error.message); return null; }
  return data as PortfolioItem;
}

// ── Update ────────────────────────────────────────────────────────────────────
export async function updatePortfolioItem(
  id: string,
  updates: Partial<Omit<PortfolioItem, 'id' | 'user_id' | 'created_at'>>,
): Promise<boolean> {
  const { error } = await supabase.from('portfolio_items').update(updates).eq('id', id);
  if (error) { console.error('[portfolio] update error:', error.message); return false; }
  return true;
}

// ── Delete ────────────────────────────────────────────────────────────────────
export async function deletePortfolioItem(id: string): Promise<boolean> {
  const { error } = await supabase.from('portfolio_items').delete().eq('id', id);
  if (error) { console.error('[portfolio] delete error:', error.message); return false; }
  return true;
}

// ── Toggle featured ───────────────────────────────────────────────────────────
export async function toggleFeatured(id: string, current: boolean): Promise<boolean> {
  const { error } = await supabase
    .from('portfolio_items')
    .update({ is_featured: !current })
    .eq('id', id);
  return !error;
}

// ── Upload media to Supabase Storage ─────────────────────────────────────────
export async function uploadPortfolioMedia(
  userId: string,
  file: File,
): Promise<{ url: string; thumbnailUrl?: string } | null> {
  const isVideo  = file.type.startsWith('video/');
  const isAudio  = file.type.startsWith('audio/');
  const isImage  = file.type.startsWith('image/');

  const bucket = isAudio ? 'audio' : 'posts';
  const folder = isVideo ? 'portfolio/videos' : isAudio ? userId : 'portfolio/images';
  const ext    = file.name.split('.').pop()?.toLowerCase() || 'bin';
  const path   = `${folder}/${userId}-${Date.now()}.${ext}`;

  const { error, data } = await supabase.storage
    .from(bucket)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) { console.error('[portfolio] upload error:', error.message); return null; }

  const url = supabase.storage.from(bucket).getPublicUrl(data.path).data.publicUrl;

  // Generate video thumbnail via canvas
  let thumbnailUrl: string | undefined;
  if (isVideo) {
    thumbnailUrl = await extractVideoFrame(file);
    if (thumbnailUrl) {
      // Upload thumbnail
      const tb = await fetch(thumbnailUrl).then(r => r.blob());
      const tp = `portfolio/thumbs/${userId}-${Date.now()}.jpg`;
      const { data: td } = await supabase.storage.from('posts').upload(tp, tb, { contentType: 'image/jpeg', upsert: false });
      if (td) thumbnailUrl = supabase.storage.from('posts').getPublicUrl(td.path).data.publicUrl;
    }
  } else if (isImage) {
    thumbnailUrl = url;
  }

  return { url, thumbnailUrl };
}

function extractVideoFrame(file: File): Promise<string> {
  return new Promise(resolve => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.src = objectUrl;
    video.muted = true;
    video.preload = 'metadata';
    video.onloadeddata = () => { video.currentTime = 1; };
    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      canvas.width  = Math.min(video.videoWidth,  720);
      canvas.height = Math.min(video.videoHeight, 720);
      canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(objectUrl);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    video.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(''); };
  });
}
