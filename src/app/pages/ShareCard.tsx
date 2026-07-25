import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowLeft, Download, Users, Award, Layers, MapPin,
  BadgeCheck, Link as LinkIcon, ArrowRight,
} from 'lucide-react';
import { toPng, toJpeg } from 'html-to-image';
import { useAuth } from '../context/AuthContext';
import { captureSnapshot } from '../lib/smartAnimate';
import { getPortfolioItems } from '../lib/portfolioApi';

// ── Export dimensions (portrait 2:3) ──────────────────────────────────────────
const EW = 1080;
const EH = 1620;

// ── Font stacks ───────────────────────────────────────────────────────────────
const SF   = "-apple-system,'SF Pro Display',BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const NEUE = "'Neue Montreal','SF Pro Display',-apple-system,sans-serif";

// ── Themes — soft premium gradients, applied only to the hero frame ───────────
const THEMES = [
  { id: 'blue',         label: 'Blue',         a: '#0d1f5c', b: '#1a4dcc', c: '#3060ff' },
  { id: 'yellow',       label: 'Yellow',       a: '#7a4b06', b: '#a16207', c: '#d97706' },
  { id: 'purple',       label: 'Purple',       a: '#3a0f7a', b: '#6d28d9', c: '#8b5cf6' },
  { id: 'red',          label: 'Red',          a: '#6b0f1a', b: '#991b1b', c: '#dc2626' },
  { id: 'black',        label: 'Black',        a: '#131318', b: '#1a1a24', c: '#33333f' },
  { id: 'green',        label: 'Green',        a: '#0f3d22', b: '#14532d', c: '#22a55e' },
  { id: 'pink',         label: 'Pink',         a: '#6e0c39', b: '#9d174d', c: '#be185d' },
  { id: 'light-blue',   label: 'Light Blue',   a: '#004a80', b: '#0284c7', c: '#38bdf8' },
  { id: 'light-purple', label: 'Light Purple', a: '#3f1080', b: '#7c3aed', c: '#a78bfa' },
  { id: 'orange',       label: 'Orange',       a: '#7a2a00', b: '#c2410c', c: '#f97316' },
] as const;

type ThemeId = typeof THEMES[number]['id'];
type Theme   = typeof THEMES[number];

const grad = (t: Theme) => `linear-gradient(155deg, ${t.a} 0%, ${t.b} 55%, ${t.c} 100%)`;

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
  tier: string;
  location: string;
}

interface CP { theme: Theme; user: CardUser; isExport?: boolean; }

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
    <div style={{ ...style, background: 'rgba(255,255,255,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width="26%" height="26%" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="8" r="4" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5"/>
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    </div>
  );
}

// ── Tiny dot separator ─────────────────────────────────────────────────────────
function Dot() {
  return <span style={{ color: '#d1d5db', fontWeight: 700 }}>·</span>;
}

// ── Profile card — white body, gradient only frames the hero photo ────────────
function ProfileCard({ theme, user, isExport: X }: CP) {
  const role = user.primaryRole || 'Creator';

  return (
    <div style={{
      width: X ? EW : '100%', height: X ? EH : undefined, aspectRatio: X ? undefined : '2/3',
      background: '#ffffff', display: 'flex', flexDirection: 'column',
      overflow: 'hidden', fontFamily: SF,
    }}>
      {/* Header — FILMONS wordmark, never over the photo */}
      <div style={{ padding: X ? '40px 44px 0' : '4% 4.4% 0' }}>
        <span style={{ fontFamily: NEUE, fontWeight: 800, letterSpacing: '0.18em',
          color: '#9198a3', fontSize: X ? 14 : 'clamp(5px, 1.4%, 14px)',
          textTransform: 'uppercase' as const }}>FILMONS</span>
      </div>

      {/* Hero — theme gradient frames the photo; the only color on the card */}
      <div style={{
        margin: X ? '20px 44px 0' : '2% 4.4% 0',
        height: X ? '840px' : '51.8%',
        flexShrink: 0,
        padding: X ? '12px' : '1.1%',
        borderRadius: X ? '44px' : '4.1%',
        background: grad(theme),
        boxShadow: `0 24px 48px -12px ${theme.c}55`,
      }}>
        <div style={{ width: '100%', height: '100%', borderRadius: X ? '34px' : '3.1%', overflow: 'hidden' }}>
          <Photo src={user.avatar} alt={user.name} style={{ width: '100%', height: '100%' }} />
        </div>
      </div>

      {/* Info */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        padding: X ? '36px 56px 44px' : '3.6% 5.2% 4.4%',
      }}>
        {/* Name + verified badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: X ? '8px' : '0.8%' }}>
          <p style={{ margin: 0, color: '#0f1115', fontWeight: 800, letterSpacing: '-0.02em',
            fontSize: X ? 46 : 'clamp(16px, 4.6%, 46px)' }}>{user.name}</p>
          {user.isVerified && (
            <BadgeCheck
              size={X ? 26 : undefined}
              style={!X ? { width: '2.6%', height: '2.6%', flexShrink: 0 } : undefined}
              color="#22c55e" fill="#22c55e" strokeWidth={2} stroke="#ffffff"
            />
          )}
        </div>

        {/* Username + role */}
        <p style={{ margin: X ? '6px 0 0' : '0.6% 0 0', color: '#9ca3af', fontWeight: 500,
          fontSize: X ? 22 : 'clamp(8px, 2.2%, 22px)' }}>@{user.username}</p>
        <p style={{ margin: X ? '4px 0 0' : '0.4% 0 0', color: '#374151', fontWeight: 600,
          fontSize: X ? 24 : 'clamp(8px, 2.4%, 24px)' }}>{role}</p>

        {/* Bio */}
        {user.bio && (
          <p style={{ margin: X ? '18px 0 0' : '1.8% 0 0', color: '#6b7280', fontWeight: 500,
            lineHeight: 1.5, fontSize: X ? 23 : 'clamp(8px, 2.3%, 23px)' }}>{user.bio}</p>
        )}

        <div style={{ marginTop: 'auto', paddingTop: X ? '32px' : '3.2%' }}>
          {/* Stats row */}
          <div style={{
            display: 'flex', alignItems: 'center', flexWrap: 'wrap',
            gap: X ? '10px' : '1%', color: '#4b5563',
            fontSize: X ? 21 : 'clamp(7px, 2.1%, 21px)', fontWeight: 600,
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: X ? '6px' : '0.6%' }}>
              <Users size={X ? 18 : undefined} style={!X ? { width: '1.8%', height: '1.8%' } : undefined}
                color="#9ca3af" strokeWidth={2} />
              {user.followers} Followers
            </span>
            <Dot/>
            <span style={{ display: 'flex', alignItems: 'center', gap: X ? '6px' : '0.6%' }}>
              <Award size={X ? 18 : undefined} style={!X ? { width: '1.8%', height: '1.8%' } : undefined}
                color="#9ca3af" strokeWidth={2} />
              {user.tier}
            </span>
            <Dot/>
            <span style={{ display: 'flex', alignItems: 'center', gap: X ? '6px' : '0.6%' }}>
              <Layers size={X ? 18 : undefined} style={!X ? { width: '1.8%', height: '1.8%' } : undefined}
                color="#9ca3af" strokeWidth={2} />
              {user.projects} Works
            </span>
            {user.location && (
              <>
                <Dot/>
                <span style={{ display: 'flex', alignItems: 'center', gap: X ? '6px' : '0.6%' }}>
                  <MapPin size={X ? 18 : undefined} style={!X ? { width: '1.8%', height: '1.8%' } : undefined}
                    color="#9ca3af" strokeWidth={2} />
                  {user.location}
                </span>
              </>
            )}
          </div>

          {/* Portfolio link — Apple Wallet style */}
          <div style={{ marginTop: X ? '26px' : '2.6%', paddingTop: X ? '26px' : '2.6%',
            borderTop: '1px solid #eef0f2' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: X ? '6px' : '0.6%' }}>
                <LinkIcon size={X ? 15 : undefined} style={!X ? { width: '1.5%', height: '1.5%' } : undefined}
                  color="#9ca3af" strokeWidth={2} />
                <span style={{ color: '#9ca3af', fontWeight: 600,
                  fontSize: X ? 18 : 'clamp(6px, 1.8%, 18px)' }}>Portfolio</span>
              </div>
              <ArrowRight size={X ? 15 : undefined} style={!X ? { width: '1.5%', height: '1.5%' } : undefined}
                color="#9ca3af" strokeWidth={2} />
            </div>
            <p style={{ margin: X ? '6px 0 0' : '0.6% 0 0', color: '#0f1115', fontWeight: 800,
              fontSize: X ? 24 : 'clamp(8px, 2.4%, 24px)' }}>filmons.app/{user.username}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Theme swatch ──────────────────────────────────────────────────────────────
function ThemeSwatch({ theme, selected, onClick }: { theme: Theme; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="relative overflow-hidden transition-all active:scale-95"
      style={{
        aspectRatio: '1/1', width: '100%',
        background: grad(theme),
        border: selected ? '2px solid white' : '2px solid transparent',
        borderRadius: '10px',
        boxShadow: selected
          ? '0 0 0 1px rgba(255,255,255,0.25), 0 4px 16px rgba(0,0,0,0.5)'
          : '0 2px 8px rgba(0,0,0,0.4)',
      }}>
      {selected && (
        <div className="absolute top-1 right-1">
          <div className="w-3.5 h-3.5 rounded-full bg-white flex items-center justify-center shadow">
            <svg viewBox="0 0 10 10" className="w-2 h-2" fill="none">
              <path d="M2 5l2.5 2.5 4-4" stroke={theme.c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>
      )}
    </button>
  );
}

// ── Account tier label ─────────────────────────────────────────────────────────
function tierLabel(accountType?: string): string {
  switch (accountType) {
    case 'creator_plus': return 'Creator+';
    case 'professional': return 'Professional';
    case 'business':     return 'Business';
    default:              return 'Creator';
  }
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function ShareCard() {
  const { user }   = useAuth();
  const navigate    = useNavigate();
  const exportRef   = useRef<HTMLDivElement>(null);
  const [themeId,    setThemeId]    = useState<ThemeId>('blue');
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

  const goBack = () => {
    setLeaving(true);
    setTimeout(() => navigate(-1), 320);
  };

  const theme = THEMES.find(t => t.id === themeId) ?? THEMES[0];

  const userData: CardUser = {
    name:        user?.name        || 'Your Name',
    username:    user?.username    || 'username',
    avatar:      user?.avatar      || '',
    bio:         user?.bio         || '',
    primaryRole: user?.primaryRole || 'Creator',
    followers:   user?.followers?.length || 0,
    projects,
    isVerified:  !!user?.isVerified,
    tier:        tierLabel(user?.accountType || user?.accountMode),
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
          onClick={exportCard}
          disabled={exporting}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-gray-950 text-xs font-bold rounded-lg disabled:opacity-40 transition-all active:scale-95"
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
            <ProfileCard theme={theme} user={userData} isExport />
          </div>
        </div>

        {/* Preview */}
        <div
          className="w-full rounded-2xl overflow-hidden"
          style={{ boxShadow: '0 32px 80px rgba(0,0,0,0.5), 0 4px 20px rgba(0,0,0,0.6)' }}
        >
          <ProfileCard theme={theme} user={userData} />
        </div>

        {/* Theme selector — live preview, applies to the hero frame only */}
        <div className="rounded-xl bg-white/[0.04] border border-white/[0.07] p-4">
          <p className="text-[9px] font-semibold text-white/20 uppercase tracking-[0.18em] mb-3">Theme</p>
          <div className="grid grid-cols-5 gap-2.5">
            {THEMES.map(t => (
              <div key={t.id} className="flex flex-col items-center gap-1.5">
                <ThemeSwatch theme={t} selected={themeId === t.id} onClick={() => setThemeId(t.id)} />
                <span className="text-[8px] text-white/28 font-medium text-center leading-tight">{t.label}</span>
              </div>
            ))}
          </div>
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
