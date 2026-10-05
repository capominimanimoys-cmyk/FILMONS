// Starts uploading post media the moment it is picked, so by the time the
// user has written a caption and taps Post the (large) video is usually
// already in storage and publish only awaits whatever is left. Keyed by the
// local blob: URL; a failed upload is evicted so publish retries it.
import { supabase } from '../../lib/supabase';

const inflight = new Map<string, Promise<string | null>>();

async function doUpload(previewUrl: string, userId: string, folder: string, file?: File): Promise<string | null> {
  try {
    const blob = file ?? await (await fetch(previewUrl)).blob();
    const isVideo = folder === 'videos';
    const ext = blob.type.split('/')[1]?.replace('jpeg', 'jpg') || (isVideo ? 'mp4' : 'jpg');
    const path = `${folder}/${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
    const { error } = await supabase.storage.from('posts').upload(path, blob, { upsert: false, contentType: blob.type });
    if (error) throw error;
    return supabase.storage.from('posts').getPublicUrl(path).data.publicUrl;
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
