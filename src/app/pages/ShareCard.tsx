import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowLeft, Download, Copy, Share2, Check,
  Users, Briefcase, Layers, MapPin, BadgeCheck, Link as LinkIcon,
} from 'lucide-react';
import { toPng } from 'html-to-image';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { captureSnapshot } from '../lib/smartAnimate';
import { getPortfolioItems } from '../lib/portfolioApi';

// ── Export width — height is content-driven (measured at export time) so the
//    card never carries unnecessary empty space. ─────────────────────────────
const EW = 1080;

// ── Font stacks ───────────────────────────────────────────────────────────────
const SF   = "-apple-system,'SF Pro Display',BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
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

// ── Profile card — a white card floating on a soft gray canvas. Height is
//    entirely content-driven: no forced aspect ratio, no bottom-anchored
//    stats row, so there's never leftover empty space. ─────────────────────────
function ProfileCard({ user, isExport: X }: CP) {
  const role = user.primaryRole || 'Creator';

  return (
    <div style={{
      width: X ? EW : '100%', background: '#F5F5F3',
      padding: X ? '44px' : '4.4%', fontFamily: SF,
    }}>
      <div style={{
        background: '#ffffff', borderRadius: '32px',
        overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.08)',
      }}>
        {/* FILMONS wordmark — inside the card, top-left, never over the photo */}
        <div style={{ padding: X ? '22px 28px 0' : '2.2% 2.8% 0' }}>
          <span style={{ fontFamily: NEUE, fontWeight: 800, letterSpacing: '0.06em',
            color: '#0f1115', fontSize: X ? 20 : 'clamp(8px, 2%, 20px)',
            textTransform: 'uppercase' as const }}>FILMONS</span>
        </div>

        {/* Hero photo — portrait-friendly 4:3, face kept centered via object-position */}
        <div style={{
          margin: X ? '10px 28px 0' : '1% 2.8% 0',
          aspectRatio: '4 / 3',
          borderRadius: '24px',
          overflow: 'hidden',
        }}>
          <Photo src={user.avatar} alt={user.name} style={{ width: '100%', height: '100%' }} />
        </div>

        {/* Info — tight, content-driven spacing */}
        <div style={{ padding: X ? '16px 28px 32px' : '1.6% 2.8% 3.2%' }}>
          {/* Name + verified badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: X ? '8px' : '0.8%' }}>
            <p style={{ margin: 0, color: '#0f1115', fontWeight: 800, letterSpacing: '-0.02em',
              fontSize: X ? 40 : 'clamp(14px, 4%, 40px)' }}>{user.name}</p>
            {user.isVerified && (
              <BadgeCheck
                size={X ? 26 : 20} style={{ flexShrink: 0 }}
                color="#22c55e" fill="#22c55e" strokeWidth={2} stroke="#ffffff"
              />
            )}
          </div>

          {/* Bio */}
          {user.bio && (
            <p style={{ margin: X ? '4px 0 0' : '0.4% 0 0', color: '#6b7280', fontWeight: 500,
              lineHeight: 1.5, fontSize: X ? 21 : 'clamp(8px, 2.1%, 21px)' }}>{user.bio}</p>
          )}

          {/* Link row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: X ? '8px' : '0.8%',
            marginTop: X ? '7px' : '0.7%' }}>
            <LinkIcon size={X ? 16 : 13} color="#9ca3af" strokeWidth={2} />
            <span style={{ color: '#6b7280', fontWeight: 500,
              fontSize: X ? 20 : 'clamp(7px, 2%, 20px)' }}>filmons.app/{user.username}</span>
          </div>

          {/* Stats row — icons use a fixed numeric `size` (not CSS %) in both
              modes: percentage width/height on an <svg> whose ancestor chain
              has no explicit height resolves to 0 per spec, which some
              browsers (Safari) honor strictly, rendering the icon invisible
              even though Chromium quietly falls back to the intrinsic size. */}
          <div style={{
            marginTop: X ? '9px' : '0.9%',
            display: 'flex', alignItems: 'center', flexWrap: 'wrap',
            gap: X ? '16px' : '1.6%', color: '#0f1115',
            fontSize: X ? 20 : 'clamp(7px, 2%, 20px)', fontWeight: 700,
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: X ? '6px' : '0.6%' }}>
              <Users size={X ? 19 : 15} color="#9ca3af" strokeWidth={2} />
              {user.followers}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: X ? '6px' : '0.6%' }}>
              <Briefcase size={X ? 19 : 15} color="#9ca3af" strokeWidth={2} />
              {role}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: X ? '6px' : '0.6%' }}>
              <Layers size={X ? 19 : 15} color="#9ca3af" strokeWidth={2} />
              {user.projects}
            </span>
            {user.location && (
              <>
                <VBar X={X} />
                <span style={{ display: 'flex', alignItems: 'center', gap: X ? '6px' : '0.6%' }}>
                  <MapPin size={X ? 19 : 15} color="#9ca3af" strokeWidth={2} />
                  {user.location}
                </span>
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
  const [visible,    setVisible]    = useState(false);
  const [leaving,    setLeaving]    = useState(false);
  const [projects,   setProjects]   = useState(0);
  const [copied,     setCopied]     = useState(false);

  useEffect(() => { requestAnimationFrame(() => setVisible(true)); }, []);

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
      const dataUrl = await toPng(exportRef.current, {
        width:    EW,
        height,
        pixelRatio: 1,
        quality:  0.98,
        skipFonts: false,
        backgroundColor: '#F5F5F3',
        fetchRequestInit: { cache: 'no-cache' as RequestCache },
        style: { transform: 'none' },
      });
      const a    = document.createElement('a');
      a.href     = dataUrl;
      a.download = `filmons-${userData.username}.png`;
      a.click();
    } catch (e) {
      console.error('Export failed:', e);
    }
    setExporting(false);
  }, [exporting, userData.username]);

  return (
    <div
      className="min-h-screen flex flex-col bg-[#F5F5F3] pb-24 transition-transform duration-300 ease-out"
      style={{ transform: visible && !leaving ? 'translateY(0)' : 'translateY(100%)' }}
    >

      {/* Header */}
      <div className="sticky top-0 z-30 bg-[#050505]/90 backdrop-blur-md border-b border-white/[0.06] px-4 py-3 flex items-center gap-3 shrink-0">
        <button
          onClick={() => { captureSnapshot(); goBack(); }}
          className="w-8 h-8 flex items-center justify-center text-white/35 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4"/>
        </button>
        <h1 className="text-sm font-bold text-white flex-1 tracking-wide">Share Card</h1>
        <button
          onClick={copyLink}
          title="Copy link"
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 text-white/70 hover:bg-white/15 hover:text-white transition-all active:scale-95 shrink-0"
        >
          {copied ? <Check className="w-3.5 h-3.5"/> : <Copy className="w-3.5 h-3.5"/>}
        </button>
        <button
          onClick={shareLink}
          title="Share link"
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 text-white/70 hover:bg-white/15 hover:text-white transition-all active:scale-95 shrink-0"
        >
          <Share2 className="w-3.5 h-3.5"/>
        </button>
        <button
          onClick={exportCard}
          disabled={exporting}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-gray-950 text-xs font-bold rounded-lg disabled:opacity-40 transition-all active:scale-95 shrink-0"
        >
          {exporting
            ? <div className="w-3 h-3 border-2 border-gray-950 border-t-transparent rounded-full animate-spin"/>
            : <Download className="w-3 h-3"/>}
          Save Image
        </button>
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
        <div style={{ width: '88vw', maxWidth: '560px' }}>
          <ProfileCard user={userData} />
        </div>

        <p className="text-center text-[9px] text-black/25 leading-relaxed tracking-wide mt-4">
          1080px wide · Instagram · Stories · LinkedIn · X · WhatsApp
        </p>
      </div>
    </div>
  );
}
