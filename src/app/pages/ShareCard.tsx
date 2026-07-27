import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowLeft, Download, Copy, Share2, Check, BadgeCheck, Link as LinkIcon,
  Users, Briefcase, Layers, MapPin,
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
function Photo({ src, alt, style }: { src: string; alt: string; style: React.CSSProperties }) {
  if (src) {
    return (
      <img
        src={src} alt={alt} crossOrigin="anonymous"
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

// ── A stat: small icon + value, no text label — cleaner for a scannable card ──
// `flexShrink: 0` on the outer span alone isn't enough to stop the inner text
// from being clipped: a flex item's automatic min-width resolves to 0 (not
// its content size) once it has `overflow` other than `visible`, so the old
// ellipsis styles let this span shrink and truncate ("Creator" -> "Creat…")
// despite the parent claiming not to shrink. No overflow/ellipsis here at
// all — full text, never truncated; the row wraps whole stats instead.
function Stat({ icon: Icon, value, X }: { icon: typeof Users; value: string | number; X?: boolean }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: X ? '6px' : '0.6%', flexShrink: 0 }}>
      <Icon size={X ? 17 : 14} color="#9ca3af" strokeWidth={2} style={{ flexShrink: 0 }} />
      <span style={{ color: '#0f1115', fontWeight: 600, flexShrink: 0,
        fontSize: X ? 20 : 'clamp(7px, 1.9%, 20px)', whiteSpace: 'nowrap' }}>{value}</span>
    </span>
  );
}

// ── Profile card — a white card floating on a soft gray canvas. Height is
//    entirely content-driven: no forced aspect ratio, no bottom-anchored
//    stats row, so there's never leftover empty space. ─────────────────────────
function ProfileCard({ user, isExport: X }: CP) {
  const role = user.primaryRole || 'Creator';

  return (
    <div style={{
      width: X ? EW : '100%', background: '#F5F5F3',
      padding: X ? '32px' : '3%', fontFamily: SF,
    }}>
      <div style={{
        background: '#ffffff', borderRadius: '34px',
        overflow: 'hidden', boxShadow: '0 20px 56px rgba(0,0,0,0.08)',
      }}>
        {/* FILMONS wordmark — inside the card, top-left, never over the photo */}
        <div style={{ padding: X ? '30px 40px 0' : '2.8% 3.7% 0' }}>
          <span style={{ fontFamily: NEUE, fontWeight: 800, letterSpacing: '0.06em',
            color: '#0f1115', fontSize: X ? 21 : 'clamp(8px, 1.9%, 21px)',
            textTransform: 'uppercase' as const }}>FILMONS</span>
        </div>

        {/* Hero photo — 2:3 portrait */}
        <div style={{
          margin: X ? '16px 40px 0' : '1.5% 3.7% 0',
          aspectRatio: '2 / 3',
          borderRadius: '24px',
          overflow: 'hidden',
        }}>
          <Photo src={user.avatar} alt={user.name} style={{ width: '100%', height: '100%' }} />
        </div>

        {/* Info — one cohesive block: tight rhythm, content-driven */}
        <div style={{ padding: X ? '18px 40px 40px' : '1.7% 3.7% 3.7%' }}>
          {/* Name + verified badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: X ? '8px' : '0.7%' }}>
            <p style={{ margin: 0, color: '#0f1115', fontWeight: 700, letterSpacing: '-0.02em',
              fontSize: X ? 42 : 'clamp(15px, 3.9%, 42px)' }}>{user.name}</p>
            {user.isVerified && (
              <BadgeCheck
                size={X ? 26 : 21} style={{ flexShrink: 0 }}
                color="#22c55e" fill="#22c55e" strokeWidth={2} stroke="#ffffff"
              />
            )}
          </div>

          {/* Bio */}
          {user.bio && (
            <p style={{ margin: X ? '8px 0 0' : '0.7% 0 0', color: '#6b7280', fontWeight: 400,
              lineHeight: 1.5, fontSize: X ? 20 : 'clamp(7px, 1.9%, 20px)' }}>{user.bio}</p>
          )}

          {/* Link row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: X ? '7px' : '0.6%',
            marginTop: X ? '8px' : '0.7%' }}>
            <LinkIcon size={X ? 15 : 12} color="#9ca3af" strokeWidth={2} />
            <span style={{ color: '#6b7280', fontWeight: 500,
              fontSize: X ? 18 : 'clamp(6px, 1.7%, 18px)' }}>filmons.app/{user.username}</span>
          </div>

          {/* Stats — icon + value, single row, divider only before location */}
          <div style={{
            marginTop: X ? '16px' : '1.5%',
            display: 'flex', alignItems: 'center', flexWrap: 'wrap',
            gap: X ? '16px' : '1.5%',
          }}>
            <Stat icon={Users} value={user.followers} X={X} />
            <Stat icon={Briefcase} value={role} X={X} />
            <Stat icon={Layers} value={user.projects} X={X} />
            {user.location && (
              <>
                <VBar X={X} />
                <Stat icon={MapPin} value={user.location} X={X} />
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

  const exportCard = useCallback(async () => {
    if (!exportRef.current || exporting) return;
    setExporting(true);
    try {
      // Height is content-driven — measure the actual rendered height at the
      // fixed export width so the downloaded image matches the preview
      // exactly, with no cropping and no leftover space.
      const height = Math.ceil(exportRef.current.getBoundingClientRect().height);
      const blob = await toBlob(exportRef.current, {
        width:    EW,
        height,
        pixelRatio: 1,
        quality:  0.98,
        skipFonts: false,
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

  const actionBtn = 'flex items-center gap-1.5 px-4 py-2.5 bg-black/[0.04] hover:bg-black/[0.07] ' +
    'text-gray-900 text-xs font-semibold rounded-full transition-all active:scale-95 disabled:opacity-40';

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
          <ProfileCard user={userData} isExport />
        </div>
      </div>

      {/* Canvas — the card floats centered, both horizontally and vertically,
          with generous whitespace. The card itself (via ProfileCard) already
          renders its own light gray padding, white card, radius and soft
          shadow, so the on-screen preview matches the export 1:1. */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-10">
        <div style={{ width: '90vw', maxWidth: '580px' }}>
          <ProfileCard user={userData} />
        </div>

        {/* Actions — below the card, clear background with dark text */}
        <div className="flex items-center justify-center gap-2.5 mt-6">
          <button onClick={copyLink} className={actionBtn}>
            {copied ? <Check className="w-3.5 h-3.5"/> : <Copy className="w-3.5 h-3.5"/>}
            Copy Link
          </button>
          <button onClick={shareLink} className={actionBtn}>
            <Share2 className="w-3.5 h-3.5"/>
            Share Link
          </button>
          <button onClick={exportCard} disabled={exporting} className={actionBtn}>
            {exporting
              ? <div className="w-3.5 h-3.5 border-2 border-gray-900 border-t-transparent rounded-full animate-spin"/>
              : <Download className="w-3.5 h-3.5"/>}
            Save Image
          </button>
        </div>
      </div>
    </div>
  );
}

