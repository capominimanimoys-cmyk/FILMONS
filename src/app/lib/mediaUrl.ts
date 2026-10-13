// Sized images for cards. When the project's Supabase Storage has image resizing available, a card
// asks for a copy at (about) the width it is displayed at instead of the full camera-size upload.
// Whether resizing exists is tested once per device with a real image request and remembered; until
// that is known (or when it isn't available) the original URL is used, so nothing ever breaks.
const FLAG_KEY = 'filmons_img_transform';
const FLAG_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PUBLIC_RE = /^(https:\/\/[a-z0-9]+\.supabase\.co)\/storage\/v1\/object\/public\/(.+)$/i;

let enabled: boolean | null = null;
let probing = false;

function readFlag(): boolean | null {
  if (enabled !== null) return enabled;
  try {
    const raw = localStorage.getItem(FLAG_KEY);
    if (!raw) return null;
    const { v, at } = JSON.parse(raw);
    if (Date.now() - at > FLAG_TTL_MS) return null;
    return (enabled = !!v);
  } catch { return null; }
}

function probe(originalUrl: string) {
  if (probing || typeof Image === 'undefined') return;
  probing = true;
  const test = new Image();
  const done = (ok: boolean) => {
    enabled = ok; probing = false;
    try { localStorage.setItem(FLAG_KEY, JSON.stringify({ v: ok, at: Date.now() })); } catch { /* ignore */ }
  };
  test.onload = () => done(true);
  test.onerror = () => done(false);
  test.src = renderUrl(originalUrl, 64) ?? originalUrl;
}

function renderUrl(url: string, width: number): string | null {
  const m = PUBLIC_RE.exec(url.split('?')[0]);
  if (!m) return null;
  return `${m[1]}/storage/v1/render/image/public/${m[2]}?width=${width}&quality=72`;
}

/** URL of `url` sized for a card about `width` CSS px wide (rounded up to a 2x screen), or `url` itself. */
export function thumbUrl(url: string | null | undefined, width: number): string {
  if (!url) return '';
  if (!PUBLIC_RE.test(url.split('?')[0])) return url;
  const flag = readFlag();
  if (flag === null) { probe(url); return url; }
  if (!flag) return url;
  const dpr = typeof window !== 'undefined' ? Math.min(2, Math.ceil(window.devicePixelRatio || 1)) : 1;
  return renderUrl(url, Math.round(width * dpr / 40) * 40 || 80) ?? url;
}
