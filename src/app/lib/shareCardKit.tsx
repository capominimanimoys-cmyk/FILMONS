/**
 * Shared FILMONS ShareCard kit — the design system + export/share machinery
 * behind every ShareCard variant (Profile: ShareCard.tsx, Listing:
 * ListingShareCard.tsx). Extracted so every variant looks like part of the
 * same family and so the CORS/export fixes (see useExportImageDataUrl /
 * waitForImgReady below) only ever need to live in one place.
 */
import { useEffect, useRef, useState } from 'react';
import { toBlob } from 'html-to-image';
import { projectId, publicAnonKey } from '/utils/supabase/info';

// ── Export width — height is content-driven (measured at export time) so a
//    card never carries unnecessary empty space. ─────────────────────────────
export const EW = 1080;

// ── Font stacks ───────────────────────────────────────────────────────────────
export const SF   = "-apple-system,'SF Pro Text','SF Pro Display',BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
export const NEUE = "'Neue Montreal','SF Pro Display',-apple-system,sans-serif";

export const shareCardNavBtn = 'w-8 h-8 flex items-center justify-center rounded-full text-gray-900/60 ' +
  'hover:text-gray-900 hover:bg-black/[0.05] transition-colors active:scale-95 disabled:opacity-40';

// Slide-in/out page transition -- a keyframe `animation`, not a `transition`,
// because this app's global `*` rule in theme.css silently neutralizes
// Tailwind's transition-* utilities (unlayered rules beat layered ones
// under the CSS Cascade Layers spec) -- animations aren't touched by it.
export const shareCardTransitionCss = `
  @keyframes shareCardEnter { from { transform: translateX(100%); } to { transform: translateX(0); } }
  @keyframes shareCardExit  { from { transform: translateX(0); } to { transform: translateX(100%); } }
`;
export function shareCardTransitionStyle(leaving: boolean): React.CSSProperties {
  return { animation: `${leaving ? 'shareCardExit' : 'shareCardEnter'} var(--dur-page, 320ms) var(--ease-sheet, cubic-bezier(0.32,0.72,0,1)) both` };
}

// ── Photo element — handles a missing image. object-position biases toward
//    the upper-third (38%) rather than pure top or pure center: most photos
//    have headroom above the subject, so 'top' clips it and plain 'center'
//    still crops close on tall photos. A heuristic, not real face detection. ──
export function Photo({ src, alt, style, exportMode }: { src: string; alt: string; style: React.CSSProperties; exportMode?: boolean }) {
  if (src) {
    // crossOrigin is only needed on the hidden export copy, as a last-resort
    // fallback for html-to-image's own re-fetch (see useExportImageDataUrl
    // below, which is the primary fix) — the visible on-screen copy never
    // captures to canvas, so it's left off there to avoid it ever failing to
    // load a photo whose host doesn't answer CORS preflights.
    const cors = exportMode && !src.startsWith('data:') ? { crossOrigin: 'anonymous' as const } : {};
    return (
      <img
        src={src} alt={alt} {...cors}
        style={{ ...style, objectFit: 'cover', objectPosition: 'center 38%', display: 'block' }}
      />
    );
  }
  return (
    <div style={{ ...style, background: '#eef1f4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width="26%" height="26%" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="8" r="4" stroke="#c7ccd3" strokeWidth="1.5"/>
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="#c7ccd3" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    </div>
  );
}

// ── Vertical divider — sits inline within a stats row ──────────────────────────
export function VBar({ X }: { X?: boolean }) {
  return <span style={{ width: '1px', alignSelf: 'stretch', background: '#e5e7eb', margin: X ? '2px 0' : '0.2% 0' }} />;
}

// ── A stat: small uppercase label over a big value — no icon ──────────────────
export function Stat({ label, value, X }: { label: string; value: string | number; X?: boolean }) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      <span style={{ color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase' as const,
        letterSpacing: '0.04em', whiteSpace: 'nowrap',
        fontSize: X ? 13 : 'clamp(6px, 1.2%, 13px)' }}>{label}</span>
      <span style={{ color: '#0f1115', fontWeight: 800, whiteSpace: 'nowrap',
        fontSize: X ? 34 : 'clamp(12px, 3.1%, 34px)' }}>{value}</span>
    </span>
  );
}

// ── Account tier badge (Business > Professional > Creator+ > Creator, same
//    priority as AccountTypeBadge.tsx) — the ShareCard's own inline-styled
//    render of it, since the Tailwind component doesn't fit this export
//    tree's px-based sizing. ─────────────────────────────────────────────────
export function tierBadgeFor(tier: 'creator' | 'creator_plus' | 'professional' | 'business'): { label: string; bg: string } | null {
  if (tier === 'business') return { label: 'Business', bg: '#059669' };
  if (tier === 'professional') return { label: 'Professional', bg: '#4f46e5' };
  if (tier === 'creator_plus') return { label: 'Creator+', bg: '#7c3aed' };
  return null;
}

// html-to-image re-fetches every <img> src itself to embed it in the export
// (a plain <img> display doesn't need CORS, but that internal fetch() does)
// — per its own docs, a failed fetch just renders that area blank rather
// than erroring, which is exactly "photo missing from the downloaded image"
// while the live preview looks fine. Pre-fetches the image into a data URL
// ourselves so the export node never depends on html-to-image being able to
// re-fetch it at all. Works for any image this app needs to export (a
// user's avatar, a listing's cover photo) -- not avatar-specific despite
// the proxy endpoint's name.
//
// Falls back through proxy-avatar (a server-side fetch, not subject to
// CORS) when the direct browser fetch fails -- e.g. a Google-signup
// account's avatar (lh3.googleusercontent.com/..., see GoogleSignup.tsx),
// which serves fine to a plain <img> but blocks a cross-origin fetch()
// read. Our own Supabase storage images (avatars, listing covers) are
// CORS-permissive by default and never need the fallback.
export function useExportImageDataUrl(src: string) {
  const [dataUrl, setDataUrl] = useState('');
  const readyRef = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    if (!src) { setDataUrl(''); return; }
    let cancelled = false;
    let markReady: () => void = () => {};
    readyRef.current = new Promise(resolve => { markReady = resolve; });

    const fetchAsDataUrl = (url: string, init?: RequestInit) =>
      fetch(url, init)
        .then(res => { if (!res.ok) throw new Error(`image fetch ${res.status}`); return res.blob(); })
        .then(blob => new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload  = () => resolve(reader.result as string);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        }));

    fetchAsDataUrl(src)
      .catch(err => {
        console.warn('[ShareCard] direct image fetch failed, retrying via proxy-avatar:', err);
        const proxied = `https://${projectId}.supabase.co/functions/v1/proxy-avatar?url=${encodeURIComponent(src)}`;
        return fetchAsDataUrl(proxied, { headers: { Authorization: `Bearer ${publicAnonKey}`, apikey: publicAnonKey } });
      })
      .then(url => { if (!cancelled) setDataUrl(url); })
      .catch(err => {
        console.error('[ShareCard] image prefetch for export failed (direct and proxied):', err);
        if (!cancelled) setDataUrl('');
      })
      .finally(() => markReady());
    return () => { cancelled = true; };
  }, [src]);
  return { dataUrl, readyRef };
}

// Waits for a specific <img> element to actually reflect `expectedSrc` in
// the DOM (closing a React-commit race: a state update settling doesn't
// guarantee the DOM has been repainted with it yet, which is more likely
// to still be catching up on a slower mobile device), then for the image
// to finish loading/decoding. No-op if expectedSrc is falsy (caller had no
// prefetched data URL to wait for -- e.g. prefetch failed entirely).
export async function waitForImgReady(img: HTMLImageElement | null | undefined, expectedSrc: string) {
  if (!img) return;
  if (expectedSrc && img.src !== expectedSrc) {
    await new Promise<void>(resolve => {
      let tries = 0;
      const check = () => {
        if (img.src === expectedSrc || ++tries > 60) return resolve();
        requestAnimationFrame(check);
      };
      check();
    });
  }
  if (!img.complete) {
    await new Promise<void>(resolve => {
      img.addEventListener('load', () => resolve(), { once: true });
      img.addEventListener('error', () => resolve(), { once: true });
    });
  }
  try { await img.decode(); } catch {}
}

// Captures `exportRef`'s content to a PNG and hands it to the native share
// sheet (mobile "Save Image" / "Save to Photos") or a direct download
// fallback on desktop. `shareUrl`, when given, is included alongside the
// file in the share payload (Web Share API Level 2) so a share destination
// that supports it gets the real page link, not just a flat image.
export async function captureAndShareCard(opts: {
  exportRef: React.RefObject<HTMLDivElement>;
  filename: string;
  shareUrl?: string;
  backgroundColor?: string;
}): Promise<void> {
  const { exportRef, filename, shareUrl, backgroundColor = '#F5F5F3' } = opts;
  if (!exportRef.current) return;
  const height = Math.ceil(exportRef.current.getBoundingClientRect().height);
  const blob = await toBlob(exportRef.current, {
    width: EW, height, pixelRatio: 1, quality: 0.98, skipFonts: false, cacheBust: true,
    backgroundColor, fetchRequestInit: { cache: 'no-cache' as RequestCache }, style: { transform: 'none' },
  });
  if (!blob) throw new Error('toBlob returned null');
  const file = new File([blob], filename, { type: 'image/png' });

  // Mobile Safari (and several Android browsers) ignore the <a download>
  // attribute for blob/data URLs — tapping the link just opens/navigates to
  // the image instead of saving it. The native share sheet (which includes
  // "Save Image" / "Save to Photos") is the reliable path on mobile, so
  // prefer it whenever the browser can share a file.
  const shareData: ShareData & { files: File[] } = { files: [file], title: filename };
  if (shareUrl) shareData.url = shareUrl;
  if (navigator.canShare?.(shareData)) {
    try { await navigator.share(shareData); }
    catch (e) { if ((e as Error)?.name !== 'AbortError') throw e; } // user cancelled — not an error
    return;
  }
  if (shareUrl && navigator.canShare?.({ files: [file] })) {
    // Some browsers accept a file share but reject the same call once a
    // `url` is added -- retry file-only rather than falling all the way
    // back to a plain download when sharing (just without the link) would
    // still work fine.
    try { await navigator.share({ files: [file], title: filename }); return; }
    catch (e) { if ((e as Error)?.name !== 'AbortError') throw e; return; }
  }
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
