// Shrinks a portfolio upload that is over the storage size limit, in the browser, before it is
// uploaded. Images are re-encoded as JPEG (scaled down only as far as needed); videos are
// re-encoded at a bitrate chosen to land under the limit. Anything that can't be compressed is
// returned unchanged so the normal upload (and its error) still applies.

/** Largest file we upload as-is. Kept under Supabase's 50 MB default per-file cap. */
export const MAX_UPLOAD_BYTES = 45 * 1024 * 1024;

type Progress = (pct: number) => void;

export async function compressForUpload(file: File, onProgress?: Progress, maxBytes = MAX_UPLOAD_BYTES): Promise<File> {
  if (file.size <= maxBytes) return file;
  const target = Math.floor(maxBytes * 0.9);
  try {
    if (file.type.startsWith('image/') && file.type !== 'image/gif') return await compressImage(file, target, onProgress);
    if (file.type.startsWith('video/')) return await compressVideo(file, target, onProgress);
  } catch (e) {
    console.warn('[mediaCompress] compression failed, uploading original:', e);
  }
  return file;
}

const renamed = (file: File, ext: string, type: string, blob: Blob) =>
  new File([blob], file.name.replace(/\.[^.]+$/, '') + '.' + ext, { type, lastModified: Date.now() });

// ── Images ───────────────────────────────────────────────────────────────────
async function compressImage(file: File, target: number, onProgress?: Progress): Promise<File> {
  const bitmap = await createImageBitmap(file);
  let maxSide = Math.min(4096, Math.max(bitmap.width, bitmap.height));
  let quality = 0.88;
  let best: Blob | null = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale)), h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas unavailable');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);          // JPEG has no transparency
    ctx.drawImage(bitmap, 0, 0, w, h);
    best = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', quality));
    onProgress?.(Math.min(95, Math.round(((attempt + 1) / 4) * 100)));
    if (best && best.size <= target) break;
    // Too big still: shrink the picture first, then lower quality.
    maxSide = Math.round(maxSide * 0.8);
    quality = Math.max(0.6, quality - 0.06);
  }
  bitmap.close?.();
  if (!best || best.size >= file.size) throw new Error('could not shrink image');
  onProgress?.(100);
  return renamed(file, 'jpg', 'image/jpeg', best);
}

// ── Video ────────────────────────────────────────────────────────────────────
function pickVideoMime(): { mime: string; ext: string } | null {
  const options: [string, string][] = [
    ['video/webm;codecs=vp9,opus', 'webm'], ['video/webm;codecs=vp8,opus', 'webm'], ['video/webm', 'webm'],
    ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'mp4'], ['video/mp4', 'mp4'],
  ];
  for (const [mime, ext] of options) if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) return { mime, ext };
  return null;
}

/** Plays the video once into a MediaRecorder (real time) at a bitrate sized to fit the limit. */
export type TrimRange = { start: number; end: number };

async function compressVideo(file: File, target: number, onProgress?: Progress, range?: TrimRange): Promise<File> {
  const fmt = pickVideoMime();
  if (!fmt || typeof HTMLCanvasElement.prototype.captureStream !== 'function') throw new Error('video compression unsupported');

  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.src = url; video.playsInline = true; video.preload = 'auto'; video.crossOrigin = 'anonymous';
  try {
    await new Promise<void>((res, rej) => {
      video.onloadedmetadata = () => res();
      video.onerror = () => rej(new Error('video unreadable'));
    });
    const fullDuration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    const rangeStart = range ? Math.max(0, range.start) : 0;
    const rangeEnd = range ? Math.min(range.end, fullDuration || range.end) : fullDuration;
    // Only the selected part is re-encoded, so the bitrate budget is spread over just that length.
    const duration = range ? Math.max(0.1, rangeEnd - rangeStart) : fullDuration;
    const AUDIO_BPS = 96_000;
    const budgetBits = target * 8 * 0.9;
    const videoBps = duration
      ? Math.min(8_000_000, Math.max(250_000, Math.floor(budgetBits / duration) - AUDIO_BPS))
      : 2_500_000;

    // Downscale big sources (e.g. 4K) so the bitrate isn't spread over too many pixels.
    const longest = Math.max(video.videoWidth, video.videoHeight) || 1280;
    const scale = Math.min(1, (videoBps > 3_000_000 ? 1920 : 1280) / longest);
    const w = Math.max(2, Math.round((video.videoWidth || 1280) * scale) & ~1);
    const h = Math.max(2, Math.round((video.videoHeight || 720) * scale) & ~1);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas unavailable');

    const out = canvas.captureStream(30);
    // Route the audio into the recording only (never to the speakers) while the video plays.
    let audioCtx: AudioContext | null = null;
    try {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const dest = audioCtx.createMediaStreamDestination();
      audioCtx.createMediaElementSource(video).connect(dest);
      dest.stream.getAudioTracks().forEach(t => out.addTrack(t));
    } catch { /* no audio track -- video only */ }

    const recorder = new MediaRecorder(out, { mimeType: fmt.mime, videoBitsPerSecond: videoBps, audioBitsPerSecond: AUDIO_BPS });
    const chunks: Blob[] = [];
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    const stopped = new Promise<void>(res => { recorder.onstop = () => res(); });

    let raf = 0;
    const draw = () => {
      ctx.drawImage(video, 0, 0, w, h);
      if (duration) onProgress?.(Math.min(99, Math.round(((video.currentTime - rangeStart) / duration) * 100)));
      raf = requestAnimationFrame(draw);
    };
    const ended = new Promise<void>(res => {
      video.onended = () => res();
      if (range) video.ontimeupdate = () => { if (video.currentTime >= rangeEnd) res(); };
    });
    if (rangeStart > 0) {
      await new Promise<void>(res => { video.onseeked = () => res(); video.currentTime = rangeStart; });
    }
    recorder.start(1000);
    await video.play();
    draw();
    await ended;
    cancelAnimationFrame(raf);
    video.pause();
    recorder.stop();
    await stopped;
    audioCtx?.close().catch(() => {});

    const blob = new Blob(chunks, { type: fmt.mime.split(';')[0] });
    if (!blob.size || (!range && blob.size >= file.size)) throw new Error('compressed video not smaller');
    onProgress?.(100);
    return renamed(file, fmt.ext, blob.type, blob);
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute('src');
  }
}

/** Largest video we will upload, and the length-per-size rule the trimmer uses. */
export const MAX_VIDEO_BYTES = 40 * 1024 * 1024;

/** The longest stretch of this video that still fits the size limit (at its own average bitrate). */
export function maxTrimSeconds(file: File, duration: number, maxBytes = MAX_VIDEO_BYTES): number {
  if (!duration || file.size <= maxBytes) return duration;
  return Math.max(1, Math.floor(duration * (maxBytes / file.size)));
}

/** Cuts [start, end] out of a video, re-encoded to fit the size limit. */
export async function trimVideo(file: File, range: TrimRange, onProgress?: Progress, maxBytes = MAX_VIDEO_BYTES): Promise<File> {
  return compressVideo(file, Math.floor(maxBytes * 0.9), onProgress, range);
}

// ── Photos: always optimise before upload ───────────────────────────────────────
const PHOTO_MAX_SIDE = 1920;
const PHOTO_SKIP_BYTES = 600 * 1024;   // already small: keep as-is

/** Resizes (longest side 1920px), fixes orientation and re-encodes as WebP (JPEG where WebP can't be encoded).
 *  Metadata (EXIF/GPS) is dropped by the re-encode. GIFs and anything that fails are returned unchanged. */
export async function optimizePhoto(file: File | Blob): Promise<File | Blob> {
  const type = (file.type || '').toLowerCase();
  if (type === 'image/gif' || !type.startsWith('image/')) return file;
  if (file.size <= PHOTO_SKIP_BYTES && type === 'image/webp') return file;
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= PHOTO_SKIP_BYTES) return file;
    const w = Math.max(1, Math.round(bitmap.width * scale)), h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close(); bitmap = null;
    let out = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/webp', 0.82));
    if (!out || out.type !== 'image/webp') out = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', 0.85));
    canvas.width = canvas.height = 0;   // release the backing store right away
    if (!out || out.size >= file.size) return file;
    const ext = out.type === 'image/webp' ? 'webp' : 'jpg';
    const base = (file instanceof File ? file.name : 'photo').replace(/\.[^.]+$/, '');
    return new File([out], `${base}.${ext}`, { type: out.type, lastModified: Date.now() });
  } catch (e) {
    console.warn('[mediaCompress] photo optimisation failed, uploading original:', e);
    return file;
  } finally {
    bitmap?.close();
  }
}
