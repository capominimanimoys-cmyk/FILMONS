/**
 * Filmons — Portfolio API
 * CRUD for portfolio_items table.
 * Fails gracefully if the table doesn't exist yet.
 */
import { supabase } from '../../lib/supabase';
import { projectId, publicAnonKey } from '/utils/supabase/info';

export type MediaType = 'image' | 'video' | 'audio' | 'link';

/** Creative work classification (first-step selection in Add Work flow) */
export type WorkType = 'photo' | 'video' | 'reel' | 'audio' | 'project' | 'case_study' | 'bts' | 'link';

export interface PortfolioItem {
  id:                  string;
  user_id:             string;
  work_type?:          WorkType;
  title:               string;
  description?:        string;
  category:            string;
  role?:               string;
  year?:               number;
  media_type:          MediaType;
  media_url?:          string;
  media_url_original?: string;
  thumbnail_url?:      string;
  external_link?:      string;
  is_featured:         boolean;
  tags?:               string[];
  tools?:              string[];
  client_name?:        string;
  views_count?:        number;
  saves_count?:        number;
  likes_count?:        number;
  aspect_ratio?:       number;
  width?:              number;
  height?:             number;
  sort_order?:         number;
  comments_count?:     number;
  download_allowed?:   boolean;
  created_at:          string;
  updated_at?:         string;
}

export interface PortfolioAlbum {
  id:             string;
  user_id:        string;
  title:          string;
  description?:   string;
  cover_item_id?: string;
  cover_url?:     string;  // uploaded cover image URL (DB column, see migration 20240128)
  visibility:     'public' | 'followers' | 'private';
  sort_order:     number;
  created_at:     string;
  item_count?:    number;  // client-side computed
}

export type PortfolioVisibility = 'public' | 'followers' | 'private';
export type PortfolioLayout     = 'grid' | 'large_cards' | 'minimal' | 'editorial';
export type PortfolioSortOrder  = 'newest' | 'oldest' | 'recently_updated' | 'custom';
export type PortfolioDownloads  = 'off' | 'individual' | 'selected';

export interface PortfolioSettings {
  id:                         string;
  user_id:                    string;
  visibility:                 PortfolioVisibility;
  layout:                     PortfolioLayout;
  sort_order:                 PortfolioSortOrder;
  show_about:                 boolean;
  show_message_button:       boolean;
  show_hire_button:           boolean;
  show_collaboration_button: boolean;
  show_services:              boolean;
  show_marketplace_listings: boolean;
  allow_downloads:            PortfolioDownloads;
  allow_likes:                 boolean;
  allow_comments:              boolean;
  show_view_count:             boolean;
  cover_path:                  string | null;
  cover_position_y:            number;
  max_featured:                number;
  updated_at:                  string;
}

export const DEFAULT_PORTFOLIO_SETTINGS: Omit<PortfolioSettings, 'id' | 'user_id' | 'updated_at'> = {
  visibility: 'public', layout: 'grid', sort_order: 'newest',
  show_about: true, show_message_button: true, show_hire_button: true,
  show_collaboration_button: false, show_services: false, show_marketplace_listings: false,
  allow_downloads: 'off', allow_likes: true, allow_comments: true, show_view_count: true,
  cover_path: null, cover_position_y: 50, max_featured: 6,
};

export interface PortfolioComment {
  id:         string;
  item_id:    string;
  user_id:    string;
  body:       string;
  created_at: string;
}

export const PORTFOLIO_CATEGORIES = [
  'Film & Video',
  'Photography',
  'Modeling',
  'Gaming',
  'Music & Audio',
  'Design & Creative',
  'Fashion',
  'Commercial',
  'Editorial',
  'Documentary',
  'Other',
];

/** Maps a WorkType to the underlying storage media_type */
export function workTypeToMediaType(wt: WorkType): MediaType {
  if (wt === 'photo' || wt === 'project' || wt === 'case_study' || wt === 'bts') return 'image';
  if (wt === 'video' || wt === 'reel') return 'video';
  if (wt === 'audio') return 'audio';
  if (wt === 'link') return 'link';
  return 'image';
}

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
function storagePathFromUrl(url: string): string | null {
  const marker = `/object/public/${PORTFOLIO_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(url.slice(idx + marker.length));
}

export async function deletePortfolioItem(id: string): Promise<boolean> {
  const { data: item } = await supabase
    .from('portfolio_items')
    .select('media_url, thumbnail_url, media_url_original')
    .eq('id', id)
    .maybeSingle();

  const { error } = await supabase.from('portfolio_items').delete().eq('id', id);
  if (error) { console.error('[portfolio] delete error:', error.message); return false; }

  if (item) {
    const paths = [item.media_url, item.thumbnail_url, item.media_url_original]
      .filter((u): u is string => !!u)
      .map(storagePathFromUrl)
      .filter((p): p is string => !!p);
    if (paths.length) {
      await supabase.storage.from(PORTFOLIO_BUCKET).remove(paths).catch(() => {});
    }
  }
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
// Uses the same bucket as avatar uploads (make-ec8fe879-photos) because it is
// guaranteed to exist and have public access configured by the edge function.
const PORTFOLIO_BUCKET = 'make-ec8fe879-photos';

// Supabase JS's storage .upload() doesn't expose XHR progress events, so
// real "Uploading… 42%" feedback needs a raw XHR call against the same
// Storage REST endpoint the SDK itself uses underneath.
function xhrUploadToStorage(path: string, file: File, onProgress?: (pct: number) => void): Promise<boolean> {
  return new Promise(resolve => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `https://${projectId}.supabase.co/storage/v1/object/${PORTFOLIO_BUCKET}/${path}`);
    xhr.setRequestHeader('Authorization', `Bearer ${publicAnonKey}`);
    xhr.setRequestHeader('apikey', publicAnonKey);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = e => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = () => resolve(false);
    xhr.send(file);
  });
}

export async function uploadPortfolioMedia(
  userId: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<{ url: string; thumbnailUrl?: string } | null> {
  const isVideo = file.type.startsWith('video/');
  const isAudio = file.type.startsWith('audio/');

  const subfolder = isVideo ? 'portfolio/videos' : isAudio ? 'portfolio/audio' : 'portfolio/images';
  const ext       = file.name.split('.').pop()?.toLowerCase() || 'bin';
  const path      = `${subfolder}/${userId}-${Date.now()}.${ext}`;

  const ok = await xhrUploadToStorage(path, file, onProgress);
  if (!ok) { console.error('[portfolio] upload error'); return null; }

  const url = supabase.storage.from(PORTFOLIO_BUCKET).getPublicUrl(path).data.publicUrl;

  let thumbnailUrl: string | undefined;
  if (isVideo) {
    thumbnailUrl = await extractVideoFrame(file);
    if (thumbnailUrl) {
      const tb = await fetch(thumbnailUrl).then(r => r.blob());
      const tp = `portfolio/thumbs/${userId}-${Date.now()}.jpg`;
      const { data: td } = await supabase.storage.from(PORTFOLIO_BUCKET).upload(tp, tb, { contentType: 'image/jpeg', upsert: false });
      if (td) thumbnailUrl = supabase.storage.from(PORTFOLIO_BUCKET).getPublicUrl(td.path).data.publicUrl;
    }
  } else if (!isAudio) {
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
    video.playsInline = true;
    video.preload = 'metadata';

    let settled = false;
    const finish = (result: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      URL.revokeObjectURL(objectUrl);
      resolve(result);
    };
    // Some browsers/codecs never fire onseeked for certain short or oddly
    // encoded videos -- without a timeout the wrapping promise (and the
    // upload awaiting it) would hang forever with no error shown.
    const timeoutId = setTimeout(() => finish(''), 4000);

    const captureFrame = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width  = Math.min(video.videoWidth  || 720, 720);
        canvas.height = Math.min(video.videoHeight || 720, 720);
        canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
        finish(canvas.toDataURL('image/jpeg', 0.8));
      } catch { finish(''); }
    };

    video.onloadedmetadata = () => {
      const seekTo = Number.isFinite(video.duration) ? Math.min(1, video.duration / 2) : 0;
      try { video.currentTime = seekTo; } catch { captureFrame(); }
    };
    video.onseeked = captureFrame;
    video.onerror = () => finish('');
  });
}

/** Read an image file's natural width and height. */
export function readImageDimensions(file: File): Promise<{ width: number; height: number; aspect_ratio: number }> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const img  = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight, aspect_ratio: img.naturalWidth / img.naturalHeight });
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve({ width: 0, height: 0, aspect_ratio: 1 }); };
    img.src = url;
  });
}

// ── Album CRUD ────────────────────────────────────────────────────────────────
export async function getAlbums(userId: string): Promise<PortfolioAlbum[]> {
  try {
    const { data, error } = await supabase
      .from('portfolio_albums')
      .select('*')
      .eq('user_id', userId)
      .order('sort_order')
      .order('created_at', { ascending: false });
    if (error) { console.warn('[albums] fetch error:', error.message); return []; }
    return (data ?? []) as PortfolioAlbum[];
  } catch { return []; }
}

export async function createAlbum(
  userId: string,
  data: Pick<PortfolioAlbum, 'title' | 'description' | 'visibility'> & { cover_url?: string },
): Promise<PortfolioAlbum | null> {
  const { data: row, error } = await supabase
    .from('portfolio_albums')
    .insert({ ...data, user_id: userId })
    .select()
    .single();
  if (error) { console.error('[albums] create error:', error.message); return null; }
  return row as PortfolioAlbum;
}

export async function updateAlbum(
  id: string,
  updates: Partial<Pick<PortfolioAlbum, 'title' | 'description' | 'visibility' | 'cover_item_id' | 'cover_url'>>,
): Promise<boolean> {
  const { error } = await supabase.from('portfolio_albums').update(updates).eq('id', id);
  if (error) { console.error('[albums] update error:', error.message); return false; }
  return true;
}

export async function deleteAlbum(id: string): Promise<boolean> {
  const { error } = await supabase.from('portfolio_albums').delete().eq('id', id);
  if (error) { console.error('[albums] delete error:', error.message); return false; }
  return true;
}

export async function getAlbumItems(albumId: string): Promise<PortfolioItem[]> {
  try {
    const { data, error } = await supabase
      .from('portfolio_album_items')
      .select('item_id, sort_order, portfolio_items(*)')
      .eq('album_id', albumId)
      .order('sort_order');
    if (error) { console.warn('[albums] items error:', error.message); return []; }
    return (data ?? []).map((r: any) => r.portfolio_items).filter(Boolean) as PortfolioItem[];
  } catch { return []; }
}

export async function addItemToAlbum(albumId: string, itemId: string): Promise<boolean> {
  const { error } = await supabase
    .from('portfolio_album_items')
    .insert({ album_id: albumId, item_id: itemId })
    .select();
  return !error;
}

export async function removeItemFromAlbum(albumId: string, itemId: string): Promise<boolean> {
  const { error } = await supabase
    .from('portfolio_album_items')
    .delete()
    .eq('album_id', albumId)
    .eq('item_id', itemId);
  return !error;
}

export async function moveItemBetweenAlbums(itemId: string, fromAlbumId: string, toAlbumId: string): Promise<boolean> {
  const removed = await removeItemFromAlbum(fromAlbumId, itemId);
  const added   = await addItemToAlbum(toAlbumId, itemId);
  return removed && added;
}

export async function reorderAlbums(order: { id: string; sort_order: number }[]): Promise<boolean> {
  const results = await Promise.all(
    order.map(({ id, sort_order }) => supabase.from('portfolio_albums').update({ sort_order }).eq('id', id)),
  );
  return results.every(r => !r.error);
}

/** Deletes an album AND every portfolio item inside it (the "remove work too" choice). */
export async function deleteAlbumCascadeItems(albumId: string): Promise<boolean> {
  const { data, error: fetchError } = await supabase
    .from('portfolio_album_items')
    .select('item_id')
    .eq('album_id', albumId);
  if (fetchError) { console.error('[albums] cascade fetch error:', fetchError.message); return false; }

  const itemIds = (data ?? []).map((r: any) => r.item_id as string);
  if (itemIds.length > 0) {
    const { error: delItemsError } = await supabase.from('portfolio_items').delete().in('id', itemIds);
    if (delItemsError) { console.error('[albums] cascade delete items error:', delItemsError.message); return false; }
  }
  return deleteAlbum(albumId);
}

// ── Portfolio settings ───────────────────────────────────────────────────────
export async function getPortfolioSettings(userId: string): Promise<PortfolioSettings | null> {
  try {
    const { data, error } = await supabase
      .from('portfolio_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) { console.warn('[portfolio settings] fetch error:', error.message); return null; }
    return data as PortfolioSettings | null;
  } catch { return null; }
}

export async function upsertPortfolioSettings(
  userId: string,
  updates: Partial<Omit<PortfolioSettings, 'id' | 'user_id' | 'updated_at'>>,
): Promise<PortfolioSettings | null> {
  const { data, error } = await supabase
    .from('portfolio_settings')
    .upsert({ user_id: userId, ...updates }, { onConflict: 'user_id' })
    .select()
    .single();
  if (error) { console.error('[portfolio settings] upsert error:', error.message); return null; }
  return data as PortfolioSettings;
}

export async function resetPortfolioSettings(userId: string): Promise<PortfolioSettings | null> {
  return upsertPortfolioSettings(userId, DEFAULT_PORTFOLIO_SETTINGS);
}

export async function uploadPortfolioCover(userId: string, file: File): Promise<string | null> {
  const result = await uploadPortfolioMedia(userId, file);
  return result?.url ?? null;
}

// ── Item ordering ─────────────────────────────────────────────────────────────
export async function updateItemsOrder(items: { id: string; sort_order: number }[]): Promise<boolean> {
  const results = await Promise.all(
    items.map(({ id, sort_order }) => supabase.from('portfolio_items').update({ sort_order }).eq('id', id)),
  );
  return results.every(r => !r.error);
}

export async function setItemDownloadAllowed(itemId: string, allowed: boolean): Promise<boolean> {
  const { error } = await supabase.from('portfolio_items').update({ download_allowed: allowed }).eq('id', itemId);
  return !error;
}

// ── Engagement: likes, comments, views ───────────────────────────────────────
export async function isItemLiked(itemId: string, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('portfolio_item_likes')
    .select('item_id')
    .eq('item_id', itemId)
    .eq('user_id', userId)
    .maybeSingle();
  return !!data;
}

export async function toggleItemLike(itemId: string, userId: string, currentlyLiked: boolean): Promise<boolean> {
  if (currentlyLiked) {
    const { error } = await supabase
      .from('portfolio_item_likes')
      .delete()
      .eq('item_id', itemId)
      .eq('user_id', userId);
    return !error;
  }
  const { error } = await supabase
    .from('portfolio_item_likes')
    .insert({ item_id: itemId, user_id: userId });
  return !error;
}

export async function getItemComments(itemId: string): Promise<PortfolioComment[]> {
  try {
    const { data, error } = await supabase
      .from('portfolio_item_comments')
      .select('*')
      .eq('item_id', itemId)
      .order('created_at', { ascending: true });
    if (error) { console.warn('[portfolio comments] fetch error:', error.message); return []; }
    return (data ?? []) as PortfolioComment[];
  } catch { return []; }
}

export async function addItemComment(itemId: string, userId: string, body: string): Promise<PortfolioComment | null> {
  const { data, error } = await supabase
    .from('portfolio_item_comments')
    .insert({ item_id: itemId, user_id: userId, body })
    .select()
    .single();
  if (error) { console.error('[portfolio comments] create error:', error.message); return null; }
  return data as PortfolioComment;
}

export async function deleteItemComment(commentId: string): Promise<boolean> {
  const { error } = await supabase.from('portfolio_item_comments').delete().eq('id', commentId);
  return !error;
}

export async function incrementItemView(itemId: string): Promise<void> {
  try {
    await supabase.rpc('increment_portfolio_item_views', { p_item_id: itemId });
  } catch { /* best-effort */ }
}
