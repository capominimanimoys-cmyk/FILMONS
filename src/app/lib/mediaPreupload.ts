// Starts uploading post media the moment it is picked, so by the time the
// user has written a caption and taps Post the (large) video is usually
// already in storage and publish only awaits whatever is left. Keyed by the
// local blob: URL; a failed upload is evicted so publish retries it.
//
// Crash-safety rules this file enforces:
//   * photos are always optimised first (1920px, WebP) -- the original never goes to storage;
//   * heavy work is serialised: one photo/video optimisation at a time, at most two uploads at once;
//   * uploads report progress, and everything is released when it finishes.
import { supabase } from '../../lib/supabase';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { compressForUpload, optimizePhoto } from './mediaCompress';

const inflight = new Map<string, Promise<string | null>>();

// ── Tiny FIFO limiter ────────────────────────────────────────────────────────────
function limiter(max: number) {
  let running = 0;
  const queue: Array<() => void> = [];
  const next = () => { running--; queue.shift()?.(); };
  return async function run<T>(task: () => Promise<T>): Promise<T> {
    if (running >= max) await new Promise<void>(res => queue.push(res));
    running++;
    try { return await task(); } finally { next(); }
  };
}
const processOne = limiter(1);   // optimising/compressing is the memory-heavy part
const uploadTwo = limiter(2);

// ── Status for the posting screen ("Compressing video… 40%", "Uploading 2 files… 63%") ──
let processing: string | null = null;
const uploading = new Map<string, number>();   // upload id -> 0..100
let status: string | null = null;
const listeners = new Set<(s: string | null) => void>();
function publish() {
  let next: string | null = processing;
  if (!next && uploading.size) {
    const avg = Math.round([...uploading.values()].reduce((a, b) => a + b, 0) / uploading.size);
    next = `Uploading ${uploading.size > 1 ? `${uploading.size} files` : 'your media'}… ${avg}%`;
  }
  status = next;
  listeners.forEach(l => l(status));
}
function setProcessing(s: string | null) { processing = s; publish(); }
export function subscribeMediaStatus(cb: (s: string | null) => void): () => void {
  listeners.add(cb); cb(status);
  return () => { listeners.delete(cb); };
}

// Videos up to 500 MB upload as they are. If storage still refuses one (its own cap is lower), it is compressed to the
// safe size below and retried once. Photos are always optimised.
const VIDEO_MAX_BYTES = 500 * 1024 * 1024;
const VIDEO_SAFE_BYTES = 40 * 1024 * 1024;

async function shrinkVideo(blob: Blob, maxBytes: number): Promise<Blob> {
  const file = blob instanceof File ? blob : new File([blob], 'video', { type: blob.type, lastModified: Date.now() });
  if (file.size <= maxBytes) return blob;
  return processOne(async () => {
    setProcessing('Compressing video…');
    try {
      return await compressForUpload(file, pct => setProcessing(`Compressing video… ${pct}%`), maxBytes);
    } finally {
      setProcessing(null);
    }
  });
}

async function shrinkPhoto(blob: Blob): Promise<Blob> {
  return processOne(async () => {
    setProcessing('Optimising photo…');
    try { return await optimizePhoto(blob); } finally { setProcessing(null); }
  });
}

/** POST to Storage with upload progress (supabase-js's upload() has none). */
function putWithProgress(path: string, blob: Blob, onProgress: (pct: number) => void, token: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `https://${projectId}.supabase.co/storage/v1/object/posts/${path}`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('apikey', publicAnonKey);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.setRequestHeader('Content-Type', blob.type || 'application/octet-stream');
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let msg = `Upload failed (${xhr.status})`;
      try { msg = JSON.parse(xhr.responseText)?.message || msg; } catch { /* keep generic */ }
      reject(new Error(msg));
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.ontimeout = () => reject(new Error('Upload timed out'));
    xhr.send(blob);
  });
}

async function put(folder: string, userId: string, blob: Blob, isVideo: boolean): Promise<string> {
  const ext = blob.type.split('/')[1]?.split(';')[0].replace('jpeg', 'jpg') || (isVideo ? 'mp4' : 'jpg');
  const path = `${folder}/${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const id = path;
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || publicAnonKey;
  await uploadTwo(async () => {
    uploading.set(id, 0); publish();
    try {
      await putWithProgress(path, blob, pct => { uploading.set(id, pct); publish(); }, token);
    } finally {
      uploading.delete(id); publish();
    }
  });
  return supabase.storage.from('posts').getPublicUrl(path).data.publicUrl;
}

async function doUpload(previewUrl: string, userId: string, folder: string, file?: File): Promise<string | null> {
  try {
    const isVideo = folder === 'videos';
    let blob: Blob = file ?? await (await fetch(previewUrl)).blob();
    blob = isVideo ? await shrinkVideo(blob, VIDEO_MAX_BYTES) : await shrinkPhoto(blob);
    try {
      return await put(folder, userId, blob, isVideo);
    } catch (e: any) {
      // The bucket may cap files lower than we assumed: squeeze harder once and retry.
      if (!/size|large|exceed/i.test(String(e?.message ?? e)) || blob.size < 2 * 1024 * 1024) throw e;
      blob = isVideo ? await shrinkVideo(blob, Math.min(VIDEO_SAFE_BYTES, Math.floor(blob.size * 0.5))) : blob;
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
