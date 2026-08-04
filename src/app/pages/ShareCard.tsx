import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowLeft, Download, Copy, Share2, Check, BadgeCheck, Link as LinkIcon,
} from 'lucide-react';
import { toBlob } from 'html-to-image';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { captureSnapshot } from '../lib/smartAnimate';
import { getPortfolioItems } from '../lib/portfolioApi';

// ── Export width — height is content-driven (measured at export time) so the
//    card never carries unnecessary empty space. ─────────────────────────────
const EW = 1080;

// ── Font stacks ───────────────────────────────────────────────────────────────
const SF   = "-apple-system,'SF Pro Text','SF Pro Display',BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const NEUE = "'Neue Montreal','SF Pro Display',-apple-system,sans-serif";

// ── Shared card props ─────────────────────────────────────────────────────────
interface CardUser {
  name: string;
  username: string;
  avatar: string;
  bio: string;
  primaryRole: string;
  followers: number;
  projects: number;
  isVerified: boolean;
  location: string;
}

interface CP { user: CardUser; isExport?: boolean; }

// ── Photo element — handles missing avatar. object-position biases toward the
//    upper-third (38%) rather than pure top or pure center: most portraits
//    have headroom above the subject, so 'top' clips the face and plain
//    'center' still crops close on tall photos. There's no real face
//    detection here — this is a heuristic, not a guarantee for every photo. ───
function Photo({ src, alt, style, exportMode }: { src: string; alt: string; style: React.CSSProperties; exportMode?: boolean }) {
  if (src) {
    // crossOrigin is only needed on the hidden export copy, as a last-resort
    // fallback for html-to-image's own re-fetch (see the avatar prefetch
    // effect below) — the visible on-screen copy never captures to canvas,
    // so it's left off there to avoid it ever failing to load a photo whose
    // host doesn't answer CORS preflights.
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

// ── Vertical divider — sits inline within the stats row ────────────────────────
function VBar({ X }: { X?: boolean }) {
  return <span style={{ width: '1px', alignSelf: 'stretch', background: '#e5e7eb', margin: X ? '2px 0' : '0.2% 0' }} />;
}

// ── A stat: small uppercase label over a big value — no icon ──────────────────
function Stat({ label, value, X }: { label: string; value: string | number; X?: boolean }) {
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

// ── Profile card — a white card floating on a soft gray canvas. Only the
//    canvas (background) is pinned to a 9:16 ratio; the white card itself
//    stays content-sized (shorter) and is centered vertically within it. ─────
function ProfileCard({ user, isExport: X }: CP) {
  const role = user.primaryRole || 'Creator';

  return (
    <div style={{
      width: X ? EW : '100%', aspectRatio: '9 / 16', background: '#F5F5F3',
      padding: X ? '32px 162px' : '3% 15%', fontFamily: SF,
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
    }}>
      <div style={{
        background: '#ffffff', borderRadius: X ? '80px' : '7.4%',
        overflow: 'hidden', boxShadow: '0px 5px 15px rgba(0, 0, 0, 0.35)',
      }}>
        {/* FILMONS wordmark — inside the card, left-aligned, never over the photo */}
        <div style={{ padding: X ? '46px 56px 0' : '4.3% 5.2% 0', textAlign: 'left' }}>
          <span style={{ fontFamily: NEUE, fontWeight: 800, letterSpacing: '0.06em',
            color: '#0f1115', fontSize: X ? 24 : 'clamp(9px, 2.2%, 24px)',
            textTransform: 'uppercase' as const }}>FILMONS</span>
        </div>

        {/* Hero photo — 16:10, shorter than 3:2 so the card sits lower overall */}
        <div style={{
          margin: X ? '22px 56px 0' : '2% 5.2% 0',
          aspectRatio: '16 / 10',
          borderRadius: X ? '44px' : '4.1%',
          overflow: 'hidden',
        }}>
          <Photo src={user.avatar} alt={user.name} style={{ width: '100%', height: '100%' }} exportMode={X} />
        </div>

        {/* Info — one cohesive block: tight rhythm, content-driven, left-aligned */}
        <div style={{ padding: X ? '22px 56px 46px' : '2% 5.2% 4.3%', textAlign: 'left' }}>
          {/* Name + verified badge */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: X ? '9px' : '0.8%' }}>
            <p style={{ margin: 0, color: '#0f1115', fontWeight: 700, letterSpacing: '-0.02em',
              fontSize: X ? 50 : 'clamp(18px, 4.6%, 50px)' }}>{user.name}</p>
            {user.isVerified && (
              <BadgeCheck
                size={X ? 30 : 24} style={{ flexShrink: 0 }}
                color="#22c55e" fill="#22c55e" strokeWidth={2} stroke="#ffffff"
              />
            )}
          </div>

          {/* Bio */}
          {user.bio && (
            <p style={{ margin: X ? '10px 0 0' : '0.9% 0 0', color: '#6b7280', fontWeight: 400,
              lineHeight: 1.5, fontSize: X ? 23 : 'clamp(8px, 2.1%, 23px)' }}>{user.bio}</p>
          )}

          {/* Link row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: X ? '8px' : '0.7%',
            marginTop: X ? '10px' : '0.9%' }}>
            <LinkIcon size={X ? 17 : 14} color="#9ca3af" strokeWidth={2} />
            <span style={{ color: '#6b7280', fontWeight: 500,
              fontSize: X ? 20 : 'clamp(7px, 1.9%, 20px)' }}>filmons.app/{user.username}</span>
          </div>

          {/* Stats — label over a big value, single row, divider only before location */}
          <div style={{
            marginTop: X ? '20px' : '1.9%',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start', flexWrap: 'wrap',
            gap: X ? '28px' : '2.6%',
          }}>
            <Stat label="Followers" value={user.followers} X={X} />
            <Stat label="Role" value={role} X={X} />
            <Stat label="Works" value={user.projects} X={X} />
            {user.location && (
              <>
                <VBar X={X} />
                <Stat label="Location" value={user.location} X={X} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function ShareCard() {
  const { user }   = useAuth();
  const navigate    = useNavigate();
  const exportRef   = useRef<HTMLDivElement>(null);
  const [exporting,  setExporting]  = useState(false);
  const [leaving,    setLeaving]    = useState(false);
  const [projects,   setProjects]   = useState(0);
  const [copied,     setCopied]     = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    getPortfolioItems(user.id).then(items => setProjects(items.length));
  }, [user?.id]);

  // index.html sets no background on <html>/<body> (defaults to white), so
  // mobile Safari's overscroll bounce reveals white at the edges even though
  // this page's own container is fully painted. Match body to the page bg
  // for the lifetime of this page only.
  useEffect(() => {
    const prev = document.body.style.backgroundColor;
    document.body.style.backgroundColor = '#F5F5F3';
    return () => { document.body.style.backgroundColor = prev; };
  }, []);

  const goBack = () => {
    setLeaving(true);
    setTimeout(() => navigate(-1), 320);
  };

  const profileUrl = user?.id ? `${window.location.origin}/host/${user.id}` : window.location.origin;

  const copyLink = useCallback(async () => {
    await navigator.clipboard.writeText(profileUrl);
    setCopied(true);
    toast.success('Link copied!');
    setTimeout(() => setCopied(false), 2000);
  }, [profileUrl]);

  const shareLink = useCallback(async () => {
    if (navigator.share) {
      try { await navigator.share({ title: `${user?.name || 'Filmons'} on Filmons`, url: profileUrl }); return; } catch { /* user cancelled */ }
    }
    await copyLink();
  }, [profileUrl, user?.name, copyLink]);

  const userData: CardUser = {
    name:        user?.name        || 'Your Name',
    username:    user?.username    || 'username',
    avatar:      user?.avatar      || '',
    bio:         user?.bio         || '',
    primaryRole: user?.primaryRole || 'Creator',
    followers:   user?.followers?.length || 0,
    projects,
    isVerified:  !!user?.isVerified,
    location:    user?.location || user?.city || '',
  };

  // html-to-image re-fetches every <img> src itself to embed it in the
  // export (a plain <img> display doesn't need CORS, but that internal
  // fetch() does) — per its own docs, a failed fetch just renders that area
  // blank rather than erroring, which is exactly "photo missing from the
  // downloaded image" while the live preview looks fine. Pre-fetch the
  // avatar into a data URL ourselves so the export node never depends on
  // html-to-image being able to re-fetch it at all.
  const [avatarDataUrl, setAvatarDataUrl] = useState('');
  // exportCard awaits this before capturing, so a click that lands before the
  // prefetch below has settled still waits for it instead of racing off the
  // stale (pre-fetch) avatar URL.
  const avatarReadyRef = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    const src = userData.avatar;
    if (!src) { setAvatarDataUrl(''); return; }
    let cancelled = false;
    let markReady: () => void = () => {};
    avatarReadyRef.current = new Promise(resolve => { markReady = resolve; });
    fetch(src)
      .then(res => { if (!res.ok) throw new Error(`avatar fetch ${res.status}`); return res.blob(); })
      .then(blob => new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      }))
      .then(dataUrl => { if (!cancelled) setAvatarDataUrl(dataUrl); })
      .catch(err => {
        console.error('[ShareCard] avatar prefetch for export failed:', err);
        if (!cancelled) setAvatarDataUrl('');
      })
      .finally(() => markReady());
    return () => { cancelled = true; };
  }, [userData.avatar]);

  const exportUserData: CardUser = { ...userData, avatar: avatarDataUrl || userData.avatar };

  const exportCard = useCallback(async () => {
    if (!exportRef.current || exporting) return;
    setExporting(true);
    try {
      // Make sure the avatar has resolved to a data URL (or definitively
      // failed to) before capturing — otherwise a click that lands mid-fetch
      // would export against the not-yet-embedded remote URL.
      await avatarReadyRef.current;
      // Canvas is pinned to a 9:16 ratio via CSS aspect-ratio, so the actual
      // rendered height already reflects that (EW * 16/9) — measuring rather
      // than hardcoding keeps this correct if the ratio ever changes.
      const height = Math.ceil(exportRef.current.getBoundingClientRect().height);
      const blob = await toBlob(exportRef.current, {
        width:    EW,
        height,
        pixelRatio: 1,
        quality:  0.98,
        skipFonts: false,
        cacheBust: true,
        backgroundColor: '#F5F5F3',
        fetchRequestInit: { cache: 'no-cache' as RequestCache },
        style: { transform: 'none' },
      });
      if (!blob) throw new Error('toBlob returned null');

      const filename = `filmons-${userData.username}.png`;
      const file = new File([blob], filename, { type: 'image/png' });

      // Mobile Safari (and several Android browsers) ignore the <a download>
      // attribute for blob/data URLs — tapping the link just opens/navigates
      // to the image instead of saving it. The native share sheet (which
      // includes "Save Image" / "Save to Photos") is the reliable path on
      // mobile, so prefer it whenever the browser can share a file.
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: filename });
        } catch (e) {
          if ((e as Error)?.name !== 'AbortError') throw e; // user cancelled — not an error
        }
      } else {
        const url = URL.createObjectURL(blob);
        const a   = document.createElement('a');
        a.href     = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.error('Export failed:', e);
      toast.error('Could not save image');
    }
    setExporting(false);
  }, [exporting, userData.username]);

  const navBtn = 'w-8 h-8 flex items-center justify-center rounded-full text-gray-900/60 ' +
    'hover:text-gray-900 hover:bg-black/[0.05] transition-colors active:scale-95 disabled:opacity-40';

  return (
    <div
      className="min-h-screen flex flex-col bg-[#F5F5F3] pb-24"
      style={{ animation: `${leaving ? 'shareCardExit' : 'shareCardEnter'} var(--dur-page, 320ms) var(--ease-sheet, cubic-bezier(0.32,0.72,0,1)) both` }}
    >
      {/* CSS transitions on this element are silently neutralized by the
          global `*` rule in theme.css (its transition-property/-duration
          wins over any Tailwind transition-* utility here because Tailwind
          v4 utilities live inside `@layer utilities`, and per the CSS
          Cascade Layers spec, unlayered rules always beat layered ones
          regardless of specificity). Every other slide-in sheet in this app
          sidesteps that by using a keyframe `animation` instead of a
          `transition` — animations aren't touched by that rule — so this
          does the same. */}
      <style>{`
        @keyframes shareCardEnter { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes shareCardExit  { from { transform: translateX(0); } to { transform: translateX(100%); } }
      `}</style>

      {/* Header — transparent, sits directly on the page's light background */}
      <div className="sticky top-0 z-30 bg-transparent px-4 py-3 flex items-center gap-3 shrink-0">
        <button
          onClick={() => { captureSnapshot(); goBack(); }}
          className="w-8 h-8 flex items-center justify-center text-gray-900/50 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4"/>
        </button>
        <h1 className="text-sm font-bold text-gray-900 flex-1 tracking-wide">Share Card</h1>

        {/* Actions — right side of the same nav bar */}
        <div className="flex items-center gap-1">
          <button onClick={copyLink} title="Copy Link" className={navBtn}>
            {copied ? <Check className="w-4 h-4"/> : <Copy className="w-4 h-4"/>}
          </button>
          <button onClick={shareLink} title="Share Link" className={navBtn}>
            <Share2 className="w-4 h-4"/>
          </button>
          <button onClick={exportCard} disabled={exporting} title="Save Image" className={navBtn}>
            {exporting
              ? <div className="w-3.5 h-3.5 border-2 border-gray-900 border-t-transparent rounded-full animate-spin"/>
              : <Download className="w-4 h-4"/>}
          </button>
        </div>
      </div>

      {/* Hidden export target — the ref'd node must carry no hiding styles of its
          own (html-to-image serializes its inline style verbatim, so offscreen
          positioning or opacity on the captured node itself yields a blank export);
          the hiding lives on this outer wrapper instead. Height is left auto so
          the node lays out at its true content height for measurement. */}
      <div style={{
        position: 'fixed', left: 0, top: 0, width: 0, height: 0,
        overflow: 'hidden', pointerEvents: 'none',
      }}>
        <div ref={exportRef} style={{ width: `${EW}px` }}>
          <ProfileCard user={exportUserData} isExport />
        </div>
      </div>

      {/* Canvas — the card floats centered, both horizontally and vertically,
          with generous whitespace. The card itself (via ProfileCard) already
          renders its own light gray padding, white card, radius and soft
          shadow, so the on-screen preview matches the export 1:1. */}
      <div className="flex-1 flex flex-col items-center justify-center p-3 md:p-6">
        <div style={{ width: '100%', maxWidth: '760px' }}>
          <ProfileCard user={userData} />
        </div>
      </div>
    </div>
  );
}

