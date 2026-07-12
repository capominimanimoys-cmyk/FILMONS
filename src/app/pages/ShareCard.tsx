import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Download, Link2, MapPin, User } from 'lucide-react';
import { toPng, toJpeg } from 'html-to-image';
import { useAuth } from '../context/AuthContext';
import { captureSnapshot } from '../lib/smartAnimate';

// ── Themes ────────────────────────────────────────────────────────────────────
const THEMES = [
  { id: 'blue',         label: 'Blue',         from: '#1a56ff', mid: '#5b8fff', to: '#c8dcff', light: '#eef4ff' },
  { id: 'yellow',       label: 'Yellow',       from: '#e67e00', mid: '#ffb340', to: '#ffe8a0', light: '#fff8e6' },
  { id: 'purple',       label: 'Purple',       from: '#6d28d9', mid: '#9b5de5', to: '#d4aaff', light: '#f3eeff' },
  { id: 'red',          label: 'Red',          from: '#b91c1c', mid: '#e53e3e', to: '#fca5a5', light: '#fff0f0' },
  { id: 'black',        label: 'Black',        from: '#111111', mid: '#2d2d2d', to: '#7a7a7a', light: '#d4d4d4' },
  { id: 'green',        label: 'Green',        from: '#14532d', mid: '#16a34a', to: '#86efac', light: '#edfff4' },
  { id: 'pink',         label: 'Pink',         from: '#be185d', mid: '#ec4899', to: '#f9a8d4', light: '#fdf2f8' },
  { id: 'light-blue',   label: 'Light Blue',   from: '#0369a1', mid: '#38bdf8', to: '#bae6fd', light: '#f0faff' },
  { id: 'light-purple', label: 'Light Purple', from: '#5b21b6', mid: '#a78bfa', to: '#ddd6fe', light: '#f5f3ff' },
  { id: 'orange',       label: 'Orange',       from: '#c2410c', mid: '#f97316', to: '#fed7aa', light: '#fff7ed' },
] as const;

type ThemeId = typeof THEMES[number]['id'];

// ── Wave SVG ──────────────────────────────────────────────────────────────────
function Waves({ opacity = 0.12 }: { opacity?: number }) {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 520 520"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
      style={{ opacity }}
    >
      {/* Top-right corner waves */}
      <path d="M420 0 Q480 60 520 0" fill="none" stroke="white" strokeWidth="1.5"/>
      <path d="M380 0 Q460 80 520 40" fill="none" stroke="white" strokeWidth="1.2"/>
      <path d="M340 0 Q440 100 520 80" fill="none" stroke="white" strokeWidth="1"/>
      <path d="M440 0 Q500 40 520 20" fill="none" stroke="white" strokeWidth="0.8"/>
      {/* Bottom-left corner waves */}
      <path d="M0 420 Q60 460 0 520" fill="none" stroke="white" strokeWidth="1.5"/>
      <path d="M0 380 Q80 440 40 520" fill="none" stroke="white" strokeWidth="1.2"/>
      <path d="M0 340 Q100 420 80 520" fill="none" stroke="white" strokeWidth="1"/>
      <path d="M0 440 Q40 490 20 520" fill="none" stroke="white" strokeWidth="0.8"/>
      {/* Bottom-right subtle accent */}
      <path d="M400 520 Q480 460 520 480" fill="none" stroke="white" strokeWidth="0.6"/>
      <path d="M440 520 Q500 480 520 500" fill="none" stroke="white" strokeWidth="0.5"/>
    </svg>
  );
}

// ── Card Component (the actual exportable card) ────────────────────────────────
interface CardProps {
  theme: typeof THEMES[number];
  user: {
    name: string;
    username?: string;
    avatar?: string;
    location?: string;
    primaryRole?: string;
    city?: string;
  };
  isExport?: boolean;
}

function ShareCardFace({ theme, user, isExport = false }: CardProps) {
  const displayRole = user.primaryRole || 'Creator';
  const displayLocation = user.city || user.location || 'Worldwide';
  const displayUsername = user.username || 'filmons';
  const portfolioUrl = `filmons.app/${displayUsername}`;

  return (
    <div
      className="relative overflow-hidden select-none"
      style={{
        width: isExport ? 1080 : '100%',
        height: isExport ? 1080 : undefined,
        aspectRatio: isExport ? undefined : '1 / 1',
        background: `linear-gradient(160deg, ${theme.from} 0%, ${theme.mid} 35%, ${theme.to} 70%, ${theme.light} 100%)`,
        fontFamily: "var(--font-sans), -apple-system, 'SF Pro Display', sans-serif",
        borderRadius: isExport ? 0 : undefined,
      }}
    >
      <Waves opacity={0.10}/>

      {/* ── Content ── */}
      <div className="relative z-10 flex flex-col h-full p-[7%]">

        {/* Row 1: Logo + Photo */}
        <div className="flex items-start justify-between">
          {/* Logo */}
          <span
            style={{
              fontFamily: "var(--font-logo), 'Neue Montreal', sans-serif",
              fontWeight: 800,
              letterSpacing: '0.12em',
              fontSize: 'clamp(14px, 3.5%, 38px)',
              color: 'white',
              textTransform: 'uppercase' as const,
              lineHeight: 1,
            }}
          >
            FILMONS
          </span>

          {/* Profile Photo */}
          <div className="relative shrink-0" style={{ width: 'clamp(80px, 28%, 300px)', aspectRatio: '1/1' }}>
            {/* Outer ring */}
            <div
              className="absolute inset-0 rounded-full"
              style={{ border: '3px solid rgba(255,255,255,0.5)', borderRadius: '50%' }}
            />
            {/* Inner ring */}
            <div
              className="absolute rounded-full"
              style={{
                inset: '6px',
                border: '2px solid rgba(255,255,255,0.8)',
                borderRadius: '50%',
              }}
            />
            {/* Photo */}
            <div
              className="absolute rounded-full overflow-hidden"
              style={{
                inset: '12px',
                background: 'rgba(255,255,255,0.15)',
                borderRadius: '50%',
                boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
              }}
            >
              {user.avatar ? (
                <img
                  src={user.avatar}
                  alt={user.name}
                  className="w-full h-full object-cover"
                  crossOrigin="anonymous"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <User style={{ width: '40%', height: '40%', color: 'rgba(255,255,255,0.7)' }}/>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Row 2: Title text */}
        <div className="flex-1 flex flex-col justify-center" style={{ paddingTop: '6%' }}>
          <p style={{
            color: 'rgba(255,255,255,0.85)',
            fontSize: 'clamp(12px, 2.8%, 30px)',
            fontWeight: 400,
            lineHeight: 1.3,
            margin: 0,
          }}>
            Hi, I'm a
          </p>
          <p style={{
            color: 'white',
            fontSize: 'clamp(22px, 6.5%, 70px)',
            fontWeight: 800,
            lineHeight: 1.05,
            margin: '1% 0',
            letterSpacing: '-0.02em',
          }}>
            {displayRole}
          </p>
          {/* Thin rule */}
          <div style={{
            width: 'clamp(24px, 6%, 60px)',
            height: '2px',
            background: 'rgba(255,255,255,0.6)',
            margin: '2.5% 0',
            borderRadius: '2px',
          }}/>
          <p style={{
            color: 'rgba(255,255,255,0.80)',
            fontSize: 'clamp(10px, 2.2%, 24px)',
            fontWeight: 400,
            lineHeight: 1.4,
            margin: 0,
          }}>
            Check my{' '}
            <span style={{ fontWeight: 700, color: 'white' }}>Filmons</span>
            {' '}portfolio.
          </p>
        </div>

        {/* Row 3: Cards + Link */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3%', paddingTop: '4%' }}>
          {/* Left: glass info cards */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2.5%' }}>
            {/* Card 1: Name */}
            <div style={{
              background: 'rgba(255,255,255,0.18)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.35)',
              borderRadius: 'clamp(10px, 2.5%, 24px)',
              padding: 'clamp(8px, 2%, 20px) clamp(10px, 2.5%, 24px)',
              display: 'flex',
              alignItems: 'center',
              gap: 'clamp(6px, 1.5%, 14px)',
            }}>
              <div style={{
                width: 'clamp(22px, 5.5%, 56px)',
                height: 'clamp(22px, 5.5%, 56px)',
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <User style={{ width: '50%', height: '50%', color: 'white' }}/>
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ color: 'white', fontWeight: 700, fontSize: 'clamp(9px, 2%, 21px)', margin: 0, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user.name}
                </p>
                <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 'clamp(7px, 1.6%, 17px)', margin: 0, lineHeight: 1.2, marginTop: '1px' }}>
                  @{displayUsername}
                </p>
              </div>
            </div>

            {/* Card 2: Location */}
            <div style={{
              background: 'rgba(255,255,255,0.18)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.35)',
              borderRadius: 'clamp(10px, 2.5%, 24px)',
              padding: 'clamp(8px, 2%, 20px) clamp(10px, 2.5%, 24px)',
              display: 'flex',
              alignItems: 'center',
              gap: 'clamp(6px, 1.5%, 14px)',
            }}>
              <div style={{
                width: 'clamp(22px, 5.5%, 56px)',
                height: 'clamp(22px, 5.5%, 56px)',
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <MapPin style={{ width: '50%', height: '50%', color: 'white' }}/>
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ color: 'white', fontWeight: 700, fontSize: 'clamp(9px, 2%, 21px)', margin: 0, lineHeight: 1.2 }}>
                  {displayLocation}
                </p>
                <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 'clamp(7px, 1.6%, 17px)', margin: 0, lineHeight: 1.2, marginTop: '1px' }}>
                  {displayRole} & Storyteller
                </p>
              </div>
            </div>
          </div>

          {/* Right: Portfolio link */}
          <div style={{
            flexShrink: 0,
            textAlign: 'right',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: 'clamp(3px, 0.8%, 8px)',
          }}>
            <div style={{
              width: 'clamp(22px, 5%, 50px)',
              height: 'clamp(22px, 5%, 50px)',
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.20)',
              border: '1px solid rgba(255,255,255,0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginLeft: 'auto',
            }}>
              <Link2 style={{ width: '45%', height: '45%', color: 'white' }}/>
            </div>
            <p style={{ color: 'rgba(255,255,255,0.70)', fontSize: 'clamp(6px, 1.3%, 14px)', margin: 0, lineHeight: 1.3 }}>
              View my portfolio
            </p>
            <div style={{ width: 'clamp(30px, 7%, 70px)', height: '1.5px', background: 'rgba(255,255,255,0.4)', borderRadius: '2px' }}/>
            <p style={{
              color: 'white',
              fontWeight: 700,
              fontSize: 'clamp(7px, 1.6%, 17px)',
              margin: 0,
              lineHeight: 1.2,
              wordBreak: 'break-all' as const,
              maxWidth: 'clamp(90px, 20%, 200px)',
              textAlign: 'right',
            }}>
              {portfolioUrl}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Theme Swatch ──────────────────────────────────────────────────────────────
function ThemeSwatch({ theme, selected, onClick }: {
  theme: typeof THEMES[number];
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="relative rounded-2xl overflow-hidden transition-all active:scale-95"
      style={{
        aspectRatio: '2/3',
        background: `linear-gradient(160deg, ${theme.from} 0%, ${theme.mid} 45%, ${theme.to} 75%, ${theme.light} 100%)`,
        border: selected ? '2.5px solid white' : '2.5px solid transparent',
        boxShadow: selected ? '0 0 0 1px rgba(255,255,255,0.4), 0 4px 16px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.2)',
      }}
    >
      {selected && (
        <div className="absolute inset-0 flex items-start justify-end p-1.5">
          <div className="w-5 h-5 rounded-full bg-white/90 flex items-center justify-center shadow">
            <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none">
              <path d="M2 6l3 3 5-5" stroke={theme.from} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>
      )}
    </button>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export function ShareCard() {
  const { user } = useAuth();
  const navigate  = useNavigate();
  const cardRef   = useRef<HTMLDivElement>(null);
  const [themeId, setThemeId]     = useState<ThemeId>('red');
  const [exporting, setExporting] = useState<'png' | 'jpeg' | null>(null);

  const theme = THEMES.find(t => t.id === themeId) ?? THEMES[3];

  const userData = {
    name:        user?.name        || 'Your Name',
    username:    user?.username    || 'username',
    avatar:      user?.avatar      || '',
    location:    user?.location    || '',
    city:        user?.city        || user?.location || '',
    primaryRole: user?.primaryRole || 'Creator',
  };

  const exportCard = useCallback(async (format: 'png' | 'jpeg') => {
    if (!cardRef.current || exporting) return;
    setExporting(format);
    try {
      const fn = format === 'png' ? toPng : toJpeg;
      const dataUrl = await fn(cardRef.current, {
        width:         1080,
        height:        1080,
        pixelRatio:    2,
        quality:       0.98,
        skipFonts:     false,
        fetchRequestInit: { cache: 'no-cache' },
        style: {
          width:        '1080px',
          height:       '1080px',
          transform:    'none',
          borderRadius: '0',
        },
      });
      const a   = document.createElement('a');
      a.href    = dataUrl;
      a.download = `filmons-${userData.username}-card.${format}`;
      a.click();
    } catch (e) {
      console.error('Export failed:', e);
    }
    setExporting(null);
  }, [exporting, userData.username]);

  return (
    <div className="min-h-screen bg-gray-950 pb-20">

      {/* Header */}
      <div className="sticky top-0 z-30 bg-gray-950/90 backdrop-blur-md border-b border-white/5 px-4 py-3.5 flex items-center gap-3">
        <button
          onClick={() => { captureSnapshot(); navigate(-1); }}
          className="w-8 h-8 flex items-center justify-center text-white/50 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4"/>
        </button>
        <h1 className="text-base font-black text-white flex-1">Share Profile Card</h1>
        {/* Export buttons in header for mobile */}
        <div className="flex gap-2">
          <button
            onClick={() => exportCard('png')}
            disabled={!!exporting}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-gray-950 text-xs font-black rounded-xl disabled:opacity-50 transition-all active:scale-95"
          >
            {exporting === 'png' ? (
              <div className="w-3 h-3 border-2 border-gray-950 border-t-transparent rounded-full animate-spin"/>
            ) : (
              <Download className="w-3 h-3"/>
            )}
            PNG
          </button>
          <button
            onClick={() => exportCard('jpeg')}
            disabled={!!exporting}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 border border-white/15 text-white text-xs font-black rounded-xl disabled:opacity-50 transition-all active:scale-95"
          >
            {exporting === 'jpeg' ? (
              <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"/>
            ) : (
              <Download className="w-3 h-3"/>
            )}
            JPEG
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-5 space-y-6">

        {/* ── Card Preview ── */}
        <div
          className="w-full rounded-3xl overflow-hidden shadow-2xl"
          style={{ boxShadow: `0 24px 64px ${theme.from}55, 0 4px 16px rgba(0,0,0,0.4)` }}
        >
          {/* Hidden 1:1 export target */}
          <div
            ref={cardRef}
            style={{
              position: 'absolute',
              left: '-9999px',
              top:  '-9999px',
              width: '1080px',
              height: '1080px',
              pointerEvents: 'none',
            }}
          >
            <ShareCardFace theme={theme} user={userData} isExport/>
          </div>
          {/* Visible preview */}
          <ShareCardFace theme={theme} user={userData}/>
        </div>

        {/* ── Background Theme ── */}
        <div className="rounded-3xl bg-gray-900 border border-white/5 p-5 space-y-4">
          <div>
            <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Background Theme</p>
            <p className="text-sm font-semibold text-white mt-0.5">Choose a style</p>
          </div>
          <div className="grid grid-cols-5 gap-2.5">
            {THEMES.map(t => (
              <div key={t.id} className="flex flex-col items-center gap-1.5">
                <ThemeSwatch
                  theme={t}
                  selected={themeId === t.id}
                  onClick={() => setThemeId(t.id)}
                />
                <span className="text-[9px] text-white/40 font-semibold text-center">{t.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Export ── */}
        <div className="rounded-3xl bg-gray-900 border border-white/5 p-5 space-y-3">
          <div>
            <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Export</p>
            <p className="text-sm font-semibold text-white mt-0.5">Download your share card</p>
            <p className="text-xs text-white/30 mt-0.5">1080 × 1080 px · Perfect for Instagram, LinkedIn, X, WhatsApp</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => exportCard('png')}
              disabled={!!exporting}
              className="py-3.5 rounded-2xl bg-white text-gray-950 font-black text-sm flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-all"
            >
              {exporting === 'png'
                ? <div className="w-4 h-4 border-2 border-gray-950 border-t-transparent rounded-full animate-spin"/>
                : <Download className="w-4 h-4"/>}
              Download PNG
            </button>
            <button
              onClick={() => exportCard('jpeg')}
              disabled={!!exporting}
              className="py-3.5 rounded-2xl bg-white/8 border border-white/10 text-white font-black text-sm flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-all"
            >
              {exporting === 'jpeg'
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>
                : <Download className="w-4 h-4"/>}
              Download JPEG
            </button>
          </div>
        </div>

        {/* ── Info ── */}
        <p className="text-center text-xs text-white/20 pb-2">
          Your card updates instantly when you change your profile photo, role, or username in Settings.
        </p>

      </div>
    </div>
  );
}
