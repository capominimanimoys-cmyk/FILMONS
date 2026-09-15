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
  subcategory?:        string;
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
  is_hidden?:          boolean;
  created_at:          string;
  updated_at?:         string;
}

export interface PortfolioAlbum {
  id:                string;
  user_id:           string;
  title:             string;
  description?:      string;
  cover_item_id?:    string;
  cover_url?:        string;  // uploaded cover image URL (DB column, see migration 20240128)
  visibility:        'public' | 'followers' | 'private';
  sort_order:        number;
  created_at:        string;
  item_count?:       number;  // client-side computed
  primary_role?:     string;
  additional_roles?: string[];
  category?:         string;
  tags?:             string[];
  location?:         string;
  work_date?:        string;
  show_on_profile?:  boolean;
}

export interface AlbumCredit {
  id:               string;
  album_id:         string;
  role:             string;
  creator_user_id?: string | null;
  unlisted_name?:   string | null;
  sort_order:       number;
  created_at:       string;
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

export interface PortfolioCommentAuthor {
  id: string; name: string; username: string | null; avatar_url: string | null;
}

export interface PortfolioComment {
  id:          string;
  item_id:     string;
  user_id:     string;
  body:        string;
  created_at:  string;
  parent_id:   string | null;
  likes_count: number;
  liked:       boolean;
  author:      PortfolioCommentAuthor | null;
  replies:     PortfolioComment[];
}

// Extended with Acting/Animation/Events on top of the original 11 -- no
// CHECK constraint ties this column to a fixed enum (confirmed against the
// actual migration), so this is safe to grow without a schema change.
// Existing items tagged with the original values are unaffected.
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
  'Acting',
  'Animation',
  'Events',
  'Other',
];

// Centralized subcategory taxonomy -- "Music | Hip-Hop & Rap | Rap |
// Rapping | Hip-Hop Music" all normalize to one canonical subcategory
// instead of becoming five unrelated tabs. Keyed by the real
// PORTFOLIO_CATEGORIES values above (not shorthand like "Music"), so a
// portfolio_items.subcategory value is always paired with a real category
// value it actually belongs under. Not exhaustive for every field --
// covers the categories with genuinely useful, distinct subcategories;
// smaller categories (Modeling, Gaming, Events) don't have a curated list
// yet and just won't offer a subcategory picker until one is added here.
export const PORTFOLIO_SUBCATEGORIES: Record<string, string[]> = {
  'Music & Audio': [
    'Hip-Hop & Rap', 'R&B', 'Pop', 'Afrobeats', 'Electronic', 'Rock', 'Jazz',
    'Classical', 'Music Videos', 'Live Performances', 'Songwriting', 'Music Production',
  ],
  'Film & Video': [
    'Short Films', 'Feature Films', 'Documentaries', 'Commercials', 'Music Videos',
    'Cinematography', 'Directing', 'Videography', 'Editing', 'Color Grading',
    'Wedding Films', 'Corporate Video',
  ],
  'Photography': [
    'Portrait', 'Fashion', 'Wedding', 'Event', 'Product', 'Commercial',
    'Street', 'Editorial', 'Sports', 'Nature',
  ],
  'Acting': ['Film Acting', 'TV', 'Commercial', 'Theatre', 'Voice Acting', 'Comedy', 'Drama'],
  'Design & Creative': ['Graphic Design', 'Branding', 'Motion Design', 'UI/UX', 'Illustration', '3D'],
};

/** Maps a WorkType to the underlying storage media_type */
export function workTypeToMediaType(wt: WorkType): MediaType {
  if (wt === 'photo' || wt === 'project' || wt === 'case_study' || wt === 'bts') return 'image';
  if (wt === 'video' || wt === 'reel') return 'video';
  if (wt === 'audio') return 'audio';
  if (wt === 'link') return 'link';
  return 'image';
}

// Mirrors api.ts's withModerationFilter -- 20240423000000 adds
// portfolio_items.is_hidden, which may not be applied yet (migrations in
// this repo are never auto-applied). Retries without the is_hidden filter
// on undefined_column (42703) so a not-yet-applied migration can't take
// down portfolio browsing, same protection listings already has.
async function withHiddenFilter<T = any>(
  build: (filterActive: boolean) => PromiseLike<{ data: T[] | null; error: any }>,
): Promise<{ data: T[] | null; error: any }> {
  let res = await build(true);
  if (res.error?.code === '42703') res = await build(false);
  return res;
}

// ── Fetch ─────────────────────────────────────────────────────────────────────
// includeHidden -- the owner's own Portfolio page passes true so they can
// still see/manage a hidden item; every other viewer (a public visitor, or
// this same function used indirectly for someone else's page) defaults to
// excluding it, matching "Hide from Portfolio" meaning hidden from
// everyone except its owner.
export async function getPortfolioItems(userId: string, opts: { includeHidden?: boolean } = {}): Promise<PortfolioItem[]> {
  try {
    const { data, error } = await withHiddenFilter((filterActive) => {
      let q = supabase.from('portfolio_items').select('*').eq('user_id', userId);
      if (filterActive && !opts.includeHidden) q = q.eq('is_hidden', false);
      return q.order('is_featured', { ascending: false }).order('created_at', { ascending: false });
    });
    if (error) { console.warn('[portfolio] fetch error:', error.message); return []; }
    return (data ?? []) as PortfolioItem[];
  } catch { return []; }
}

export async function getPortfolioItem(id: string): Promise<PortfolioItem | null> {
  try {
    const { data, error } = await supabase.from('portfolio_items').select('*').eq('id', id).maybeSingle();
    if (error) { console.warn('[portfolio] fetch item error:', error.message); return null; }
    return data as PortfolioItem | null;
  } catch { return null; }
}

export async function setItemHidden(itemId: string, hidden: boolean): Promise<boolean> {
  return updatePortfolioItem(itemId, { is_hidden: hidden });
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

/** Read a video file's intrinsic width/height (from its decoded frame size,
 * not its display/CSS size) once metadata loads. Portfolio cards need this
 * to render a video at its OWN orientation (vertical, widescreen, square)
 * instead of a fixed default -- this was the actual gap: the upload flow
 * only ever called readImageDimensions, so every uploaded video fell back
 * to a hardcoded 16:9 box regardless of its real shape. Falls back to 16:9
 * only if the browser genuinely never fires loadedmetadata (rare/corrupt
 * file) or duration is unavailable, not silently for any error. */
export function readVideoDimensions(file: File): Promise<{ width: number; height: number; aspect_ratio: number }> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    let settled = false;
    const finish = (w: number, h: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      URL.revokeObjectURL(url);
      resolve({ width: w, height: h, aspect_ratio: w && h ? w / h : 16 / 9 });
    };
    // Same reasoning as extractVideoFrame's own timeout below -- some
    // browsers/codecs never fire loadedmetadata for certain short or
    // oddly-encoded files, which would otherwise hang the upload
    // indefinitely waiting on this promise.
    const timeoutId = setTimeout(() => finish(0, 0), 4000);

    video.onloadedmetadata = () => finish(video.videoWidth, video.videoHeight);
    video.onerror = () => finish(0, 0);
    video.src = url;
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
  updates: Partial<Pick<PortfolioAlbum,
    'title' | 'description' | 'visibility' | 'cover_item_id' | 'cover_url' |
    'primary_role' | 'additional_roles' | 'category' | 'tags' | 'location' | 'work_date' | 'show_on_profile'
  >>,
): Promise<boolean> {
  const { error } = await supabase.from('portfolio_albums').update(updates).eq('id', id);
  if (error) { console.error('[albums] update error:', error.message); return false; }
  return true;
}

/** Sets an album's cover to one of its own existing items — never uploads or duplicates media. */
export async function setAlbumCoverFromItem(albumId: string, itemId: string): Promise<boolean> {
  const { error } = await supabase
    .from('portfolio_albums')
    .update({ cover_item_id: itemId, cover_url: null })
    .eq('id', albumId);
  if (error) { console.error('[albums] set cover error:', error.message); return false; }
  return true;
}

/** Uploads a new file for an existing portfolio item and swaps its media in place. */
export async function replaceItemMedia(itemId: string, file: File): Promise<boolean> {
  const { data: item } = await supabase.from('portfolio_items').select('user_id').eq('id', itemId).maybeSingle();
  if (!item) return false;
  const result = await uploadPortfolioMedia(item.user_id, file);
  if (!result) return false;
  // Re-measure dimensions for the NEW file -- without this, replacing e.g.
  // a landscape photo with a vertical one would keep the stale old
  // aspect_ratio, rendering the new media in the wrong shape.
  const isVideo = file.type.startsWith('video/');
  const dims = isVideo ? await readVideoDimensions(file) : file.type.startsWith('image/') ? await readImageDimensions(file) : null;
  return updatePortfolioItem(itemId, {
    media_url: result.url, thumbnail_url: result.thumbnailUrl || result.url,
    ...(dims ? { width: dims.width || undefined, height: dims.height || undefined, aspect_ratio: dims.aspect_ratio } : {}),
  });
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

// ── Album credits ─────────────────────────────────────────────────────────────
export async function getAlbumCredits(albumId: string): Promise<AlbumCredit[]> {
  try {
    const { data, error } = await supabase
      .from('portfolio_album_credits')
      .select('*')
      .eq('album_id', albumId)
      .order('sort_order');
    if (error) { console.warn('[albums] credits fetch error:', error.message); return []; }
    return (data ?? []) as AlbumCredit[];
  } catch { return []; }
}

export async function addAlbumCredit(
  albumId: string,
  credit: { role: string; creatorUserId?: string | null; unlistedName?: string | null; sortOrder?: number },
): Promise<AlbumCredit | null> {
  const { data, error } = await supabase
    .from('portfolio_album_credits')
    .insert({
      album_id: albumId,
      role: credit.role,
      creator_user_id: credit.creatorUserId || null,
      unlisted_name: credit.unlistedName || null,
      sort_order: credit.sortOrder ?? 0,
    })
    .select()
    .single();
  if (error) { console.error('[albums] add credit error:', error.message); return null; }
  return data as AlbumCredit;
}

export async function updateAlbumCredit(
  id: string,
  updates: Partial<{ role: string; creator_user_id: string | null; unlisted_name: string | null }>,
): Promise<boolean> {
  const { error } = await supabase.from('portfolio_album_credits').update(updates).eq('id', id);
  return !error;
}

export async function deleteAlbumCredit(id: string): Promise<boolean> {
  const { error } = await supabase.from('portfolio_album_credits').delete().eq('id', id);
  return !error;
}

export async function reorderAlbumCredits(order: { id: string; sort_order: number }[]): Promise<boolean> {
  const results = await Promise.all(
    order.map(({ id, sort_order }) => supabase.from('portfolio_album_credits').update({ sort_order }).eq('id', id)),
  );
  return results.every(r => !r.error);
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

export async function toggleItemLike(itemId: string, userId: string, currentlyLiked: boolean, creatorId?: string): Promise<boolean> {
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
  if (!error && creatorId) logPortfolioEngagementEvent(creatorId, itemId, 'like', userId);
  return !error;
}

const COMMENT_PAGE_SIZE = 20;

// portfolio_item_comments.user_id has no declared FK to profiles (unlike
// item_id -> portfolio_items), so PostgREST can't auto-embed it -- authors
// are fetched as a separate batched query and merged client-side, same
// pattern getPortfolioFeed() already uses for creator profiles below.
//
// Top-level comments (parent_id IS NULL) are the paginated unit -- fetched
// newest-first then reversed for chat-style oldest-at-top display, so
// "Load earlier comments" is a plain `created_at < cursor` page. Replies
// are fetched in one batched follow-up query for every top-level comment
// on the page (not paginated separately -- expected reply volume per
// comment is small) and attached to their parent client-side.
export async function getItemComments(
  itemId: string,
  opts: { limit?: number; before?: string; viewerId?: string } = {},
): Promise<{ comments: PortfolioComment[]; hasMore: boolean }> {
  const limit = opts.limit ?? COMMENT_PAGE_SIZE;
  try {
    let topQ = supabase
      .from('portfolio_item_comments')
      .select('*')
      .eq('item_id', itemId)
      .is('parent_id', null)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (opts.before) topQ = topQ.lt('created_at', opts.before);
    const { data: topRows, error: topErr } = await topQ;
    if (topErr) { console.warn('[portfolio comments] fetch error:', topErr.message); return { comments: [], hasMore: false }; }

    const top = [...(topRows ?? [])].reverse();
    const hasMore = (topRows ?? []).length === limit;
    if (!top.length) return { comments: [], hasMore: false };

    const topIds = top.map((c: any) => c.id);
    const { data: replyRows } = await supabase
      .from('portfolio_item_comments')
      .select('*')
      .in('parent_id', topIds)
      .order('created_at', { ascending: true });
    const replies = replyRows ?? [];

    const allRows = [...top, ...replies];
    const allIds = allRows.map((r: any) => r.id);
    const authorIds = [...new Set(allRows.map((r: any) => r.user_id))];

    const [{ data: profileRows }, { data: likeRows }, viewerLikedRes] = await Promise.all([
      supabase.from('profiles').select('id, name, username, avatar_url').in('id', authorIds),
      supabase.from('portfolio_comment_likes').select('comment_id').in('comment_id', allIds),
      opts.viewerId
        ? supabase.from('portfolio_comment_likes').select('comment_id').eq('user_id', opts.viewerId).in('comment_id', allIds)
        : Promise.resolve({ data: [] as { comment_id: string }[] }),
    ]);

    const authorMap = new Map((profileRows ?? []).map((p: any) => [p.id, p]));
    const likeCounts = new Map<string, number>();
    (likeRows ?? []).forEach((r: any) => likeCounts.set(r.comment_id, (likeCounts.get(r.comment_id) ?? 0) + 1));
    const likedSet = new Set((viewerLikedRes.data ?? []).map((r: any) => r.comment_id));

    const toComment = (row: any): PortfolioComment => {
      const a = authorMap.get(row.user_id);
      return {
        ...row,
        likes_count: likeCounts.get(row.id) ?? 0,
        liked: likedSet.has(row.id),
        author: a ? { id: row.user_id, name: a.name, username: a.username, avatar_url: a.avatar_url } : null,
        replies: [],
      };
    };

    const repliesByParent = new Map<string, PortfolioComment[]>();
    replies.forEach((r: any) => {
      const list = repliesByParent.get(r.parent_id) ?? [];
      list.push(toComment(r));
      repliesByParent.set(r.parent_id, list);
    });

    const comments = top.map((c: any) => ({ ...toComment(c), replies: repliesByParent.get(c.id) ?? [] }));
    return { comments, hasMore };
  } catch (e) {
    console.warn('[portfolio comments] fetch error:', e);
    return { comments: [], hasMore: false };
  }
}

export async function addItemComment(
  itemId: string, userId: string, body: string, parentId?: string, creatorId?: string,
): Promise<PortfolioComment | null> {
  const { data, error } = await supabase
    .from('portfolio_item_comments')
    .insert({ item_id: itemId, user_id: userId, body, parent_id: parentId ?? null })
    .select()
    .single();
  if (error) { console.error('[portfolio comments] create error:', error.message); return null; }
  if (creatorId) logPortfolioEngagementEvent(creatorId, itemId, 'comment', userId);
  // author is left null -- the caller (PortfolioCommentSheet) already knows
  // who just posted (the current user) and fills it in locally rather than
  // this doing a redundant profile fetch for a row it already knows the
  // author of.
  return { ...data, likes_count: 0, liked: false, author: null, replies: [] } as PortfolioComment;
}

export async function isCommentLiked(commentId: string, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('portfolio_comment_likes')
    .select('comment_id')
    .eq('comment_id', commentId)
    .eq('user_id', userId)
    .maybeSingle();
  return !!data;
}

export async function toggleCommentLike(commentId: string, userId: string, currentlyLiked: boolean): Promise<boolean> {
  if (currentlyLiked) {
    const { error } = await supabase.from('portfolio_comment_likes').delete().eq('comment_id', commentId).eq('user_id', userId);
    return !error;
  }
  const { error } = await supabase.from('portfolio_comment_likes').insert({ comment_id: commentId, user_id: userId });
  return !error;
}

export async function deleteItemComment(commentId: string): Promise<boolean> {
  const { error } = await supabase.from('portfolio_item_comments').delete().eq('id', commentId);
  return !error;
}

// Save (bookmark) -- reuses the same generic `favorites` table already used
// by savedPostsApi/savedListingsApi (see lib/api.ts) with a new item_type
// discriminator, rather than a new portfolio_item_saves/portfolio_album_saves
// table -- `favorites` already has no CHECK constraint tying item_type to a
// fixed enum (posts and listings already share it with two different
// values), so this needs no migration.
export type PortfolioSaveTargetType = 'portfolio_item' | 'portfolio_album';

export async function isPortfolioSaved(userId: string, targetId: string, targetType: PortfolioSaveTargetType): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('favorites').select('item_id')
      .eq('user_id', userId).eq('item_id', targetId).eq('item_type', targetType)
      .maybeSingle();
    return !!data;
  } catch { return false; }
}

export async function togglePortfolioSave(
  userId: string, targetId: string, targetType: PortfolioSaveTargetType, currentlySaved: boolean,
): Promise<boolean> {
  if (currentlySaved) {
    const { error } = await supabase.from('favorites').delete()
      .eq('user_id', userId).eq('item_id', targetId).eq('item_type', targetType);
    return !error;
  }
  const { error } = await supabase.from('favorites').upsert(
    { user_id: userId, item_id: targetId, item_type: targetType, item_data: {} },
    { onConflict: 'user_id,item_id' },
  );
  return !error;
}

// Report -- backs the Home -> Portfolio feed card menu's "Report" action.
// No report/flag infrastructure existed anywhere in this app before this;
// see the 20240421000000_content_reports migration (not yet applied --
// needs manual application, same as every migration in this repo). This
// only records the report -- there is no admin/moderation view reading
// this table yet.
export async function reportPortfolioContent(
  reporterId: string, targetId: string, targetType: PortfolioSaveTargetType, reason?: string,
): Promise<boolean> {
  const { error } = await supabase.from('content_reports').insert({
    reporter_id: reporterId, target_id: targetId, target_type: targetType, reason: reason || null,
  });
  if (error) { console.error('[portfolio] report error:', error.message); return false; }
  return true;
}

export async function incrementItemView(itemId: string, creatorId?: string, viewerId?: string): Promise<void> {
  try {
    await supabase.rpc('increment_portfolio_item_views', { p_item_id: itemId });
  } catch { /* best-effort */ }
  if (creatorId) logPortfolioEngagementEvent(creatorId, itemId, 'view', viewerId);
}

// ── Portfolio Interaction analytics (Profile page's "Portfolio Interaction"
// section) ───────────────────────────────────────────────────────────────
// Fire-and-forget: a failed insert here should never block the like/
// comment/view/share action it's riding along with (those already
// succeeded via their own counters/tables before this is called).
export type PortfolioEngagementAction = 'view' | 'like' | 'comment' | 'share';
export function logPortfolioEngagementEvent(
  creatorId: string, itemId: string, action: PortfolioEngagementAction, viewerId?: string,
): void {
  supabase.from('portfolio_engagement_events').insert({
    creator_id: creatorId, item_id: itemId, viewer_id: viewerId || null, action,
  }).then(() => {}, () => {});
}

export interface PortfolioInteractionStats {
  views: number; likes: number; comments: number; shares: number;
  viewsChangePct: number | null; likesChangePct: number | null;
  commentsChangePct: number | null; sharesChangePct: number | null;
}

function pctChange(curr: number, prev: number): number | null {
  if (prev <= 0) return null; // no baseline to compare against -- show "New"/"—", not a divide-by-zero
  return Math.round(((curr - prev) / prev) * 100);
}

// Last 30 days vs the 30 days before that, per action, for one creator
// across their whole portfolio. Owner-only display (see PortfolioInteractionSection).
export async function getPortfolioInteractionStats(creatorId: string): Promise<PortfolioInteractionStats> {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const currStart = new Date(now - 30 * dayMs).toISOString();
  const prevStart = new Date(now - 60 * dayMs).toISOString();

  const countFor = async (action: PortfolioEngagementAction, from: string, to?: string) => {
    let q = supabase.from('portfolio_engagement_events').select('id', { count: 'exact', head: true })
      .eq('creator_id', creatorId).eq('action', action).gte('created_at', from);
    if (to) q = q.lt('created_at', to);
    const { count } = await q;
    return count ?? 0;
  };

  const actions: PortfolioEngagementAction[] = ['view', 'like', 'comment', 'share'];
  const [currCounts, prevCounts] = await Promise.all([
    Promise.all(actions.map(a => countFor(a, currStart))),
    Promise.all(actions.map(a => countFor(a, prevStart, currStart))),
  ]);
  const curr = Object.fromEntries(actions.map((a, i) => [a, currCounts[i]])) as Record<PortfolioEngagementAction, number>;
  const prev = Object.fromEntries(actions.map((a, i) => [a, prevCounts[i]])) as Record<PortfolioEngagementAction, number>;

  return {
    views: curr.view, likes: curr.like, comments: curr.comment, shares: curr.share,
    viewsChangePct: pctChange(curr.view, prev.view),
    likesChangePct: pctChange(curr.like, prev.like),
    commentsChangePct: pctChange(curr.comment, prev.comment),
    sharesChangePct: pctChange(curr.share, prev.share),
  };
}

// ── Cross-creator discovery feed (Home -> Portfolio mode) ───────────────────
// Deliberately NOT the `posts` table -- this reads the real
// portfolio_items/portfolio_albums/portfolio_album_items schema above, the
// same one every other function in this file already uses for a single
// creator's own portfolio page. A standalone item that's actually a member
// of an album is excluded from appearing as its own entry (the album card
// represents it instead) -- see excludeItemIds below. Composed client-side
// (a few plain queries + a merge/sort) rather than one SQL function -- this
// app has no way to test a new Postgres function against the live database
// from here, and a subtle bug in hand-written cursor-pagination/dedup SQL
// would be much harder to diagnose blind than the equivalent JS.
export interface PortfolioFeedCreator {
  id: string; name: string; username: string | null; avatar_url: string | null;
  primary_role: string | null; city: string | null; is_verified: boolean;
}
export interface PortfolioFeedPreviewItem {
  id: string; media_type: MediaType; url: string | null;
}
export type PortfolioFeedEntry =
  | { type: 'item'; id: string; created_at: string; creator: PortfolioFeedCreator; item: PortfolioItem }
  | { type: 'album'; id: string; created_at: string; creator: PortfolioFeedCreator; album: PortfolioAlbum; coverUrl: string | null; itemCount: number; previewItems: PortfolioFeedPreviewItem[] };

// Capped rather than truly exhaustive -- covers realistic recent activity
// without a full table scan every feed load. An item added long ago to an
// album, if that item is itself independently very recent, is the one edge
// case this doesn't catch (a real per-item `album_id` column or a dedicated
// SQL view would remove this cap entirely; flagging as a known limitation
// rather than silently pretending it's exhaustive).
const FEED_ALBUM_MEMBERSHIP_LOOKBACK = 2000;

export async function getPortfolioFeed(opts: {
  /** created_at cursor -- only entries strictly older than this (pagination) */
  before?: string;
  limit?: number;
  /** Restrict to these creators only (e.g. a "Following" feed) */
  authorIds?: string[];
  /** One of PORTFOLIO_CATEGORIES */
  category?: string;
  /** One of PORTFOLIO_SUBCATEGORIES[category] -- items only, albums have
   * no subcategory column. */
  subcategory?: string;
  /** Viewer's own city -- when set alongside `category`/`subcategory`,
   * mildly boosts same-city creators in sort order without excluding
   * anyone else ("prioritize local... while still including high-quality
   * relevant content from elsewhere", per spec). Never applied to the
   * unfiltered mixed feed, only a filtered tab. */
  viewerCity?: string;
} = {}): Promise<PortfolioFeedEntry[]> {
  const limit = opts.limit ?? 20;
  // Overfetch from each source before merging -- the two pools get combined
  // and re-sorted by created_at, so asking each source for exactly `limit`
  // could under-fill the merged page (e.g. all `limit` newest items happen
  // to be older than all `limit` newest albums).
  const fetchN = Math.max(limit * 2, 40);

  if (opts.authorIds && opts.authorIds.length === 0) return [];

  try {
    // Visibility is checked BEFORE fetching any items/albums, not after --
    // this app's tables all have permissive RLS (USING (true), see
    // project_auth_model), so there is no real row-level enforcement to
    // lean on here; the closest equivalent this architecture allows is
    // never asking a non-public creator's content INTO this query's own
    // result set in the first place, rather than fetching it and filtering
    // client-side afterward (which briefly pulls private content into a
    // network response even if the UI never renders it). `.neq('visibility',
    // 'public')` catches any non-public value this schema uses now or adds
    // later ('private', 'followers', or anything else) without hardcoding
    // an enum of "bad" values -- a creator with NO settings row at all is
    // NOT excluded here, matching this schema's own column default of
    // 'public' for a row that doesn't exist yet.
    const { data: nonPublicRows } = await supabase.from('portfolio_settings').select('user_id').neq('visibility', 'public');
    const nonPublicUserIds = (nonPublicRows ?? []).map((r: any) => r.user_id);

    const excludeItemIds = new Set<string>();
    {
      const { data } = await supabase
        .from('portfolio_album_items')
        .select('item_id')
        .order('added_at', { ascending: false })
        .limit(FEED_ALBUM_MEMBERSHIP_LOOKBACK);
      (data ?? []).forEach((r: any) => excludeItemIds.add(r.item_id));
    }

    // withHidden/withSubcategory=false is the 42703 (undefined_column)
    // fallback -- same not-yet-applied-migration protection as
    // withHiddenFilter above, kept as its own inline builder here since
    // this query also carries before/authorIds/category/nonPublicUserIds
    // that a generic wrapper would otherwise have to duplicate. Both
    // columns are dropped together on retry since a single error code
    // doesn't say which one is missing -- harmless to drop a column that
    // WAS actually fine, the query just becomes less specific for that
    // one retry rather than failing outright.
    const buildItemsQuery = (withHidden: boolean, withSubcategory: boolean) => {
      let q = supabase.from('portfolio_items').select('*');
      if (withHidden) q = q.eq('is_hidden', false);
      q = q.order('created_at', { ascending: false }).limit(fetchN);
      if (opts.before) q = q.lt('created_at', opts.before);
      if (opts.authorIds) q = q.in('user_id', opts.authorIds);
      if (opts.category) q = q.eq('category', opts.category);
      if (withSubcategory && opts.subcategory) q = q.eq('subcategory', opts.subcategory);
      if (nonPublicUserIds.length) q = q.not('user_id', 'in', `(${nonPublicUserIds.join(',')})`);
      return q;
    };
    let albumsQ = supabase.from('portfolio_albums').select('*').eq('visibility', 'public').order('created_at', { ascending: false }).limit(fetchN);
    if (opts.before) albumsQ = albumsQ.lt('created_at', opts.before);
    if (opts.authorIds) albumsQ = albumsQ.in('user_id', opts.authorIds);
    if (opts.category) albumsQ = albumsQ.eq('category', opts.category);
    if (nonPublicUserIds.length) albumsQ = albumsQ.not('user_id', 'in', `(${nonPublicUserIds.join(',')})`);

    const [itemsRes0, albumsRes] = await Promise.all([buildItemsQuery(true, true), albumsQ]);
    const itemsRes = itemsRes0.error?.code === '42703' ? await buildItemsQuery(false, false) : itemsRes0;
    let items = ((itemsRes.data ?? []) as PortfolioItem[]).filter(i => !excludeItemIds.has(i.id));
    let albums = (albumsRes.data ?? []) as PortfolioAlbum[];
    if (!items.length && !albums.length) return [];

    // Empty-album check -- an album must never appear with zero valid
    // items. portfolio_album_items.item_id has ON DELETE CASCADE against
    // portfolio_items, so a deleted item's membership row is already gone
    // by the time this query runs -- counting these rows directly already
    // reflects only items that still exist, with no separate "is the item
    // still there" check needed. This schema has no archived/hidden/status
    // column on portfolio_items to additionally check (verified against
    // the actual columns this table has) -- existence via this join is the
    // whole of "otherwise eligible" for standalone items too.
    //
    // The same query also collects each album's first 3 items (by
    // sort_order) for the editorial-collage preview (large + 2 stacked) --
    // one round trip instead of a separate count-only query plus a later
    // per-album lazy fetch, since the feed card needs real thumbnails
    // up front, not just a count.
    const itemCountByAlbum = new Map<string, number>();
    const previewByAlbum = new Map<string, PortfolioFeedPreviewItem[]>();
    if (albums.length) {
      const { data } = await supabase
        .from('portfolio_album_items')
        .select('album_id, sort_order, portfolio_items(id, media_type, media_url, thumbnail_url)')
        .in('album_id', albums.map(a => a.id))
        .order('album_id', { ascending: true })
        .order('sort_order', { ascending: true });
      (data ?? []).forEach((r: any) => {
        itemCountByAlbum.set(r.album_id, (itemCountByAlbum.get(r.album_id) ?? 0) + 1);
        const it = r.portfolio_items;
        if (!it) return;
        const list = previewByAlbum.get(r.album_id) ?? [];
        if (list.length < 3) {
          list.push({ id: it.id, media_type: it.media_type, url: it.thumbnail_url || it.media_url || null });
          previewByAlbum.set(r.album_id, list);
        }
      });
    }
    albums = albums.filter(a => (itemCountByAlbum.get(a.id) ?? 0) > 0);
    if (!items.length && !albums.length) return [];

    const authorIds = [...new Set([...items.map(i => i.user_id), ...albums.map(a => a.user_id)])];
    const { data: profileRows } = await supabase.from('profiles').select('id, name, username, avatar_url, primary_role, city, is_verified').in('id', authorIds);
    const profiles = new Map((profileRows ?? []).map((p: any) => [p.id, p]));

    // An explicit cover_item_id (a creator-chosen "featured" cover) can be
    // any item in the album, not necessarily one of the first 3 by sort
    // order -- looked up separately from previewByAlbum below rather than
    // assumed to already be in that slice.
    const coverLookupIds = albums.filter(a => !a.cover_url && a.cover_item_id).map(a => a.cover_item_id!);
    const coverItemMap = new Map<string, string | null>();
    if (coverLookupIds.length) {
      const { data } = await supabase.from('portfolio_items').select('id, thumbnail_url, media_url').in('id', coverLookupIds);
      (data ?? []).forEach((r: any) => coverItemMap.set(r.id, r.thumbnail_url || r.media_url || null));
    }

    const creatorFor = (userId: string): PortfolioFeedCreator => {
      const p = profiles.get(userId);
      return {
        id: userId, name: p?.name ?? 'Creator', username: p?.username ?? null,
        avatar_url: p?.avatar_url ?? null, primary_role: p?.primary_role ?? null, city: p?.city ?? null,
        is_verified: !!p?.is_verified,
      };
    };

    const entries: PortfolioFeedEntry[] = [
      ...items.map(item => ({ type: 'item' as const, id: item.id, created_at: item.created_at, creator: creatorFor(item.user_id), item })),
      ...albums.map(album => {
        const preview = previewByAlbum.get(album.id) ?? [];
        return {
          type: 'album' as const, id: album.id, created_at: album.created_at, creator: creatorFor(album.user_id),
          album,
          coverUrl: album.cover_url || (album.cover_item_id ? coverItemMap.get(album.cover_item_id) : null) || preview[0]?.url || null,
          itemCount: itemCountByAlbum.get(album.id) ?? 0,
          previewItems: preview,
        };
      }),
    ];
    // Location boost -- only within a filtered category/subcategory tab
    // (never the unfiltered mixed feed, which already blends everything).
    // Implemented as a fixed time bonus added to a same-city creator's
    // effective sort timestamp rather than a hard "local first" partition
    // -- a well-established, simple way to blend a relevance signal into
    // a recency-sorted feed without segregating local from non-local
    // content ("prioritize... while still including high-quality relevant
    // content from elsewhere", per spec). No boost at all if the viewer's
    // city is unknown.
    const LOCAL_BOOST_MS = 3 * 86_400_000; // effectively "3 days newer"
    const isLocalMatch = (city: string | null) =>
      !!opts.viewerCity && !!city && city.toLowerCase().includes(opts.viewerCity.toLowerCase());
    const sortKey = (e: PortfolioFeedEntry) => {
      const base = new Date(e.created_at).getTime();
      const boostEligible = !!(opts.category || opts.subcategory);
      return boostEligible && isLocalMatch(e.creator.city) ? base + LOCAL_BOOST_MS : base;
    };
    entries.sort((a, b) => sortKey(b) - sortKey(a));
    return entries.slice(0, limit);
  } catch (e) {
    console.warn('[portfolio feed] fetch error:', e);
    return [];
  }
}

// ── "People You May Know" -- Home -> Portfolio feed's creator-discovery
// row. No blocking infrastructure exists anywhere in this app yet (verified
// earlier this session -- only a hardcoded isBlocked:false placeholder in
// Conversation mapping) and profiles has no deactivated/suspended status
// column, so "blocked users" / "hidden/deactivated profiles" exclusions
// have nothing to actually filter against -- not faked here. Everything
// else in the spec IS backed by real columns/tables: candidates must have
// a public portfolio visibility (creator-level portfolio_settings, same
// gate getPortfolioFeed already enforces) and at least one non-hidden
// portfolio_items row, and "mutual follows" is a real count against the
// follows table, not a placeholder. ──────────────────────────────────────
export interface SuggestedCreator {
  id: string; name: string; username: string | null; avatar_url: string | null;
  primary_role: string | null; city: string | null; is_verified: boolean;
  mutualCount: number;
}

export async function getSuggestedCreators(
  userId: string, opts: { limit?: number } = {},
): Promise<SuggestedCreator[]> {
  const limit = opts.limit ?? 10;
  try {
    // Same shape as Home.tsx's existing Listings creator-card query
    // (profiles with a real name + primary_role) -- overfetch since a
    // chunk of candidates gets filtered out below (non-public portfolio,
    // no visible items).
    const { data: myFollowingRows } = await supabase.from('follows').select('following_id').eq('follower_id', userId);
    const alreadyFollowing = new Set((myFollowingRows ?? []).map((r: any) => r.following_id));

    const { data: candidateRows } = await supabase
      .from('profiles')
      .select('id, name, username, avatar_url, primary_role, city, is_verified')
      .not('name', 'is', null).neq('name', '')
      .not('primary_role', 'is', null)
      .order('is_verified', { ascending: false })
      .limit(limit * 6);
    const candidates = (candidateRows ?? []).filter((c: any) => c.id !== userId && !alreadyFollowing.has(c.id));
    if (!candidates.length) return [];
    const candidateIds = candidates.map((c: any) => c.id);

    // Visibility -- exclude any candidate whose portfolio is explicitly
    // non-public, checked BEFORE anything else touches their content (same
    // "never query for content the viewer shouldn't see" approach
    // getPortfolioFeed uses). A candidate with no settings row at all is
    // NOT excluded, matching the schema's own 'public' column default.
    const { data: settingsRows } = await supabase.from('portfolio_settings').select('user_id, visibility').in('user_id', candidateIds);
    const nonPublic = new Set((settingsRows ?? []).filter((s: any) => s.visibility !== 'public').map((s: any) => s.user_id));

    // Must have at least one visible portfolio item -- an empty or fully-
    // hidden portfolio isn't a useful discovery recommendation. is_hidden
    // may not exist yet if 20240423000000 hasn't been applied -- falls
    // back to "has any item at all" on that specific error rather than
    // breaking this feature over a not-yet-applied migration.
    let itemRows = (await supabase.from('portfolio_items').select('user_id, is_hidden').in('user_id', candidateIds));
    if (itemRows.error?.code === '42703') {
      itemRows = await supabase.from('portfolio_items').select('user_id').in('user_id', candidateIds) as any;
    }
    const withVisibleItem = new Set(
      (itemRows.data ?? []).filter((r: any) => !r.is_hidden).map((r: any) => r.user_id),
    );

    const eligible = candidates.filter((c: any) => !nonPublic.has(c.id) && withVisibleItem.has(c.id));
    if (!eligible.length) return [];
    const eligibleIds = eligible.map((c: any) => c.id);

    // Mutual follows -- how many people the CURRENT user already follows
    // also follow this candidate.
    const mutualCounts = new Map<string, number>();
    if (alreadyFollowing.size) {
      const { data: mutualRows } = await supabase
        .from('follows').select('following_id')
        .in('following_id', eligibleIds).in('follower_id', [...alreadyFollowing]);
      (mutualRows ?? []).forEach((r: any) => mutualCounts.set(r.following_id, (mutualCounts.get(r.following_id) ?? 0) + 1));
    }

    const suggestions: SuggestedCreator[] = eligible.map((c: any) => ({
      id: c.id, name: c.name, username: c.username, avatar_url: c.avatar_url,
      primary_role: c.primary_role, city: c.city, is_verified: !!c.is_verified,
      mutualCount: mutualCounts.get(c.id) ?? 0,
    }));
    suggestions.sort((a, b) => (b.mutualCount - a.mutualCount) || (Number(b.is_verified) - Number(a.is_verified)));
    return suggestions.slice(0, limit);
  } catch (e) {
    console.warn('[discovery] suggested creators error:', e);
    return [];
  }
}
