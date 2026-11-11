// Starts uploading post media the moment it is picked, so by the time the
// user has written a caption and taps Post the (large) video is usually
// already in storage and publish only awaits whatever is left. Keyed by the
// local blob: URL; a failed upload is evicted so publish retries it.
//
// Heavy files are shrunk in the browser first (see mediaCompress.ts), so a big photo or video
// no longer fails the storage size limit and silently goes missing from the post.
import { supabase } from '../../lib/supabase';
import { compressForUpload } from './mediaCompress';

const inflight = new Map<string, Promise<string | null>>();

// What the media pipeline is doing right now ("Compressing video… 40%"), for the posting screen.
let status: string | null = null;
const listeners = new Set<(s: string | null) => void>();
function setStatus(s: string | null) { status = s; listeners.forEach(l => l(s)); }
export function subscribeMediaStatus(cb: (s: string | null) => void): () => void {
  listeners.add(cb); cb(status);
  return () => { listeners.delete(cb); };
}

// Photos rarely need more than a few MB on a feed; videos get close to the storage cap before we touch them.
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const VIDEO_MAX_BYTES = 40 * 1024 * 1024;

async function shrink(blob: Blob, isVideo: boolean, maxBytes: number): Promise<Blob> {
  const file = blob instanceof File ? blob : new File([blob], isVideo ? 'video' : 'image', { type: blob.type, lastModified: Date.now() });
  if (file.size <= maxBytes) return blob;
  setStatus(isVideo ? 'Compressing video…' : 'Compressing photo…');
  try {
    return await compressForUpload(file, pct => setStatus(`${isVideo ? 'Compressing video' : 'Compressing photo'}… ${pct}%`), maxBytes);
  } finally {
    setStatus(null);
  }
}

async function put(folder: string, userId: string, blob: Blob, isVideo: boolean) {
  const ext = blob.type.split('/')[1]?.split(';')[0].replace('jpeg', 'jpg') || (isVideo ? 'mp4' : 'jpg');
  const path = `${folder}/${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const { error } = await supabase.storage.from('posts').upload(path, blob, { upsert: false, contentType: blob.type });
  if (error) throw error;
  return supabase.storage.from('posts').getPublicUrl(path).data.publicUrl;
}

async function doUpload(previewUrl: string, userId: string, folder: string, file?: File): Promise<string | null> {
  try {
    const isVideo = folder === 'videos';
    let blob: Blob = file ?? await (await fetch(previewUrl)).blob();
    blob = await shrink(blob, isVideo, isVideo ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES);
    try {
      return await put(folder, userId, blob, isVideo);
    } catch (e: any) {
      // The bucket may cap files lower than we assumed: squeeze harder once and retry.
      if (!/size|large|exceed/i.test(String(e?.message ?? e)) || blob.size < 2 * 1024 * 1024) throw e;
      blob = await shrink(blob, isVideo, Math.floor(blob.size * 0.5));
      return await put(folder, userId, blob, isVideo);
    }
  } catch (e) {
    console.error('[mediaPreupload] upload failed:', e);
    inflight.delete(previewUrl);
    return null;
  }
}

/** Idempotent: calling again for the same blob URL returns the same upload. */
export function uploadPostMedia(previewUrl: string, userId: string, folder: 'images' | 'videos', file?: File): Promise<string | null> {
  let p = inflight.get(previewUrl);
  if (!p) {
    p = doUpload(previewUrl, userId, folder, file);
    inflight.set(previewUrl, p);
  }
  return p;
}

export function forgetPostMedia(previewUrl: string) {
  inflight.delete(previewUrl);
}
