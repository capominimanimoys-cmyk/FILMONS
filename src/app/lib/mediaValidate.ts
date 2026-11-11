// Checks a picked file BEFORE anything heavy happens to it, so unsupported or absurdly large media is
// rejected with a clear message instead of freezing or crashing the app later.
export const LIMITS = {
  photoBytes: 30 * 1024 * 1024,
  gifBytes: 30 * 1024 * 1024,
  videoBytes: 500 * 1024 * 1024,
  videoSeconds: 10 * 60,
};

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v', 'video/3gpp'];
const mb = (n: number) => `${Math.round(n / 1048576)} MB`;

function readDuration(file: File): Promise<number> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata';
    const done = (d: number) => { URL.revokeObjectURL(url); v.removeAttribute('src'); v.load(); resolve(d); };
    v.onloadedmetadata = () => done(Number.isFinite(v.duration) ? v.duration : 0);
    v.onerror = () => done(0);
    setTimeout(() => done(0), 8000);   // some browsers never fire metadata for exotic codecs: don't hang the picker
    v.src = url;
  });
}

/** Returns a human-readable problem, or null when the file is fine to use. */
export async function validateMediaFile(file: File): Promise<string | null> {
  const t = (file.type || '').toLowerCase();
  const name = file.name || 'This file';
  if (t === 'image/gif') return file.size > LIMITS.gifBytes ? `${name} is ${mb(file.size)}. GIFs can be up to ${mb(LIMITS.gifBytes)}.` : null;
  if (t.startsWith('image/')) {
    if (!PHOTO_TYPES.includes(t)) return `${name} isn’t a supported photo type. Use JPG, PNG, WebP or HEIC.`;
    return file.size > LIMITS.photoBytes ? `${name} is ${mb(file.size)}. Photos can be up to ${mb(LIMITS.photoBytes)}.` : null;
  }
  if (t.startsWith('video/')) {
    if (!VIDEO_TYPES.includes(t)) return `${name} isn’t a supported video type. Use MP4, MOV or WebM.`;
    if (file.size > LIMITS.videoBytes) return `${name} is ${mb(file.size)}. Videos can be up to ${mb(LIMITS.videoBytes)}.`;
    const d = await readDuration(file);
    if (d > LIMITS.videoSeconds) return `${name} is ${Math.round(d / 60)} minutes long. Videos can be up to ${LIMITS.videoSeconds / 60} minutes.`;
    return null;
  }
  return `${name} isn’t a supported photo or video.`;
}

/** Splits a picked batch into usable files and readable errors (one message per rejected file). */
export async function filterValidMedia(files: File[]): Promise<{ ok: File[]; errors: string[] }> {
  const ok: File[] = []; const errors: string[] = [];
  for (const f of files) {
    const problem = await validateMediaFile(f);
    if (problem) errors.push(problem); else ok.push(f);
  }
  return { ok, errors };
}
