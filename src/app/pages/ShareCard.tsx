import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowLeft, Download, Copy, Share2, Check,
  Users, Briefcase, Layers, MapPin, BadgeCheck, Link as LinkIcon,
} from 'lucide-react';
import { toPng, toJpeg } from 'html-to-image';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { captureSnapshot } from '../lib/smartAnimate';
import { getPortfolioItems } from '../lib/portfolioApi';

// ── Export dimensions (portrait 2:3) ──────────────────────────────────────────
const EW = 1080;
const EH = 1620;

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

// ── Photo element — handles missing avatar ────────────────────────────────────
function Photo({ src, alt, style }: { src: string; alt: string; style: React.CSSProperties }) {
  if (src) {
    return (
      <img
        src={src} alt={alt} crossOrigin="anonymous"
        style={{ ...style, objectFit: 'cover', objectPosition: 'center top', display: 'block' }}
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

// ── Profile card — white body, the photo is the only source of color ──────────
function ProfileCard({ user, isExport: X }: CP) {
  const role = user.primaryRole || 'Creator';

  return (
    <div style={{
      width: X ? EW : '100%', height: X ? EH : undefined, aspectRatio: X ? undefined : '2/3',
      background: '#ffffff', display: 'flex', flexDirection: 'column',
      overflow: 'hidden', fontFamily: SF,
    }}>
      {/* Header — FILMONS wordmark, never over the photo */}
      <div style={{ padding: X ? '40px 44px 0' : '4% 4.4% 0' }}>
        <span style={{ fontFamily: NEUE, fontWeight: 800, letterSpacing: '0.06em',
          color: '#0f1115', fontSize: X ? 24 : 'clamp(8px, 2.4%, 24px)',
          textTransform: 'uppercase' as const }}>FILMONS</span>
      </div>

      {/* Hero photo */}
      <div style={{
        margin: X ? '20px 44px 0' : '2% 4.4% 0',
        height: X ? '840px' : '51.8%',
        flexShrink: 0,
        borderRadius: X ? '36px' : '3.3%',
        overflow: 'hidden',
      }}>
        <Photo src={user.avatar} alt={user.name} style={{ width: '100%', height: '100%' }} />
      </div>

      {/* Info */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        padding: X ? '32px 56px 44px' : '3.2% 5.2% 4.4%',
      }}>
        {/* Name + verified badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: X ? '8px' : '0.8%' }}>
          <p style={{ margin: 0, color: '#0f1115', fontWeight: 800, letterSpacing: '-0.02em',
            fontSize: X ? 44 : 'clamp(15px, 4.4%, 44px)' }}>{user.name}</p>
          {user.isVerified && (
            <BadgeCheck
              size={X ? 30 : undefined}
              style={!X ? { width: '3%', height: '3%', flexShrink: 0 } : undefined}
              color="#22c55e" fill="#22c55e" strokeWidth={2} stroke="#ffffff"
            />
          )}
        </div>

        {/* Bio */}
        {user.bio && (
          <p style={{ margin: X ? '10px 0 0' : '1% 0 0', color: '#6b7280', fontWeight: 500,
            lineHeight: 1.5, fontSize: X ? 23 : 'clamp(8px, 2.3%, 23px)' }}>{user.bio}</p>
        )}

        {/* Link row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: X ? '8px' : '0.8%',
          marginTop: X ? '12px' : '1.2%' }}>
          <LinkIcon size={X ? 18 : undefined} style={!X ? { width: '1.8%', height: '1.8%' } : undefined}
            color="#9ca3af" strokeWidth={2} />
          <span style={{ color: '#6b7280', fontWeight: 500,
            fontSize: X ? 22 : 'clamp(8px, 2.2%, 22px)' }}>filmons.app/{user.username}</span>
        </div>

        {/* Stats row — pinned near the bottom */}
        <div style={{
          marginTop: 'auto', paddingTop: X ? '32px' : '3.2%',
          display: 'flex', alignItems: 'center', flexWrap: 'wrap',
          gap: X ? '18px' : '1.8%', color: '#0f1115',
          fontSize: X ? 22 : 'clamp(8px, 2.2%, 22px)', fontWeight: 700,
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: X ? '6px' : '0.6%' }}>
            <Users size={X ? 20 : undefined} style={!X ? { width: '2%', height: '2%' } : undefined}
              color="#9ca3af" strokeWidth={2} />
            {user.followers}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: X ? '6px' : '0.6%' }}>
            <Briefcase size={X ? 20 : undefined} style={!X ? { width: '2%', height: '2%' } : undefined}
              color="#9ca3af" strokeWidth={2} />
            {role}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: X ? '6px' : '0.6%' }}>
            <Layers size={X ? 20 : undefined} style={!X ? { width: '2%', height: '2%' } : undefined}
              color="#9ca3af" strokeWidth={2} />
            {user.projects}
          </span>
          {user.location && (
            <>
              <VBar X={X} />
              <span style={{ display: 'flex', alignItems: 'center', gap: X ? '6px' : '0.6%' }}>
                <MapPin size={X ? 20 : undefined} style={!X ? { width: '2%', height: '2%' } : undefined}
                  color="#9ca3af" strokeWidth={2} />
                {user.location}
              </span>
            </>
          )}
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
  const [format,     setFormat]     = useState<'png' | 'jpeg'>('png');
  const [exporting,  setExporting]  = useState(false);
  const [visible,    setVisible]    = useState(false);
  const [leaving,    setLeaving]    = useState(false);
  const [projects,   setProjects]   = useState(0);

  useEffect(() => { requestAnimationFrame(() => setVisible(true)); }, []);

  useEffect(() => {
    if (!user?.id) return;
    getPortfolioItems(user.id).then(items => setProjects(items.length));
  }, [user?.id]);

  const [copied, setCopied] = useState(false);

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
      const opts = {
        width:    EW,
        height:   EH,
        pixelRatio: 1,
        quality:  0.98,
        skipFonts: false,
        backgroundColor: '#ffffff',
        fetchRequestInit: { cache: 'no-cache' as RequestCache },
        style: { transform: 'none', borderRadius: '0' },
      };
      const dataUrl = format === 'jpeg'
        ? await toJpeg(exportRef.current, opts)
        : await toPng(exportRef.current, opts);
      const a    = document.createElement('a');
      a.href     = dataUrl;
      a.download = `filmons-${userData.username}.${format === 'jpeg' ? 'jpg' : 'png'}`;
      a.click();
    } catch (e) {
      console.error('Export failed:', e);
    }
    setExporting(false);
  }, [exporting, userData.username, format]);

  return (
    <div
      className="min-h-screen bg-[#050505] pb-24 transition-transform duration-300 ease-out"
      style={{ transform: visible && !leaving ? 'translateY(0)' : 'translateY(100%)' }}
    >

      {/* Header */}
      <div className="sticky top-0 z-30 bg-[#050505]/90 backdrop-blur-md border-b border-white/[0.06] px-4 py-3 flex items-center gap-3">
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

      <div className="max-w-sm mx-auto px-4 pt-5 space-y-4">

        {/* Hidden export target — the ref'd node must carry no hiding styles of its
            own (html-to-image serializes its inline style verbatim, so offscreen
            positioning or opacity on the captured node itself yields a blank export);
            the hiding lives on this outer wrapper instead. */}
        <div style={{
          position: 'fixed', left: 0, top: 0, width: 0, height: 0,
          overflow: 'hidden', pointerEvents: 'none',
        }}>
          <div ref={exportRef} style={{ width: `${EW}px`, height: `${EH}px` }}>
            <ProfileCard user={userData} isExport />
          </div>
        </div>

        {/* Preview */}
        <div
          className="w-full rounded-2xl overflow-hidden"
          style={{ boxShadow: '0 32px 80px rgba(0,0,0,0.5), 0 4px 20px rgba(0,0,0,0.6)' }}
        >
          <ProfileCard user={userData} />
        </div>

        {/* Export format */}
        <div className="rounded-xl bg-white/[0.04] border border-white/[0.07] p-4">
          <p className="text-[9px] font-semibold text-white/20 uppercase tracking-[0.18em] mb-3">Format</p>
          <div className="grid grid-cols-2 gap-2">
            {(['png', 'jpeg'] as const).map(f => (
              <button
                key={f} type="button" onClick={() => setFormat(f)}
                className={`py-2 px-2.5 rounded-lg text-xs font-semibold uppercase tracking-wide transition-all ${
                  format === f
                    ? 'bg-white text-gray-950'
                    : 'bg-white/5 text-white/40 hover:bg-white/8 hover:text-white/70'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <p className="text-center text-[9px] text-white/15 leading-relaxed tracking-wide pb-1">
          1080 × 1620 · Portrait · Instagram · Stories · LinkedIn · X · WhatsApp
        </p>

      </div>
    </div>
  );
}
