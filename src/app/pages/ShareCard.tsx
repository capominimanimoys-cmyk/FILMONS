import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Download, Users, Briefcase, Layers, BadgeCheck } from 'lucide-react';
import { toPng } from 'html-to-image';
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
      <svg width="30%" height="30%" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="8" r="4" stroke="#c7ccd3" strokeWidth="1.5"/>
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="#c7ccd3" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    </div>
  );
}

// ── Profile card — white card, inset photo, name + bio + stats ────────────────
function ProfileCard({ user, isExport: X }: CP) {
  const role = user.primaryRole || 'Creator';

  return (
    <div style={{
      width: X ? EW : '100%', height: X ? EH : undefined, aspectRatio: X ? undefined : '2/3',
      background: '#ffffff', display: 'flex', flexDirection: 'column',
      overflow: 'hidden', fontFamily: SF,
    }}>
      {/* Photo — inset with rounded corners, top-heavy */}
      <div style={{
        position: 'relative',
        margin: X ? '44px 44px 0' : '4% 4% 0',
        height: X ? '900px' : '55.5%',
        flexShrink: 0,
        borderRadius: X ? '36px' : '3.4%',
        overflow: 'hidden',
      }}>
        <Photo src={user.avatar} alt={user.name} style={{ width: '100%', height: '100%' }} />
        {/* FILMONS wordmark */}
        <div style={{ position: 'absolute', top: X ? '28px' : '3%', left: X ? '28px' : '3%' }}>
          <span style={{ fontFamily: NEUE, fontWeight: 800, letterSpacing: '0.18em',
            color: 'rgba(255,255,255,0.85)', fontSize: X ? 16 : 'clamp(6px, 1.6%, 16px)',
            textTransform: 'uppercase' as const,
            textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>FILMONS</span>
        </div>
      </div>

      {/* Content */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: X ? '32px 56px 44px' : '3% 5.2% 4%',
      }}>
        {/* Name + verified badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: X ? '10px' : '1%' }}>
          <p style={{ margin: 0, color: '#0f1115', fontWeight: 800, letterSpacing: '-0.02em',
            fontSize: X ? 50 : 'clamp(17px, 5%, 50px)' }}>{user.name}</p>
          {user.isVerified && (
            <BadgeCheck
              size={X ? 34 : undefined}
              style={!X ? { width: '3.4%', height: '3.4%' } : undefined}
              color="#22c55e" fill="#22c55e" strokeWidth={2}
              stroke="#ffffff"
            />
          )}
        </div>

        {/* Bio */}
        {user.bio && (
          <p style={{ margin: X ? '14px 0 0' : '1.4% 0 0', color: '#6b7280', fontWeight: 500,
            lineHeight: 1.4, fontSize: X ? 26 : 'clamp(9px, 2.6%, 26px)' }}>{user.bio}</p>
        )}

        {/* Stats row: followers + primary role + projects */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: X ? '28px' : '2.8%',
          marginTop: X ? '40px' : '4%',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: X ? '8px' : '0.8%' }}>
            <Users size={X ? 24 : undefined} style={!X ? { width: '2.4%', height: '2.4%' } : undefined}
              color="#9ca3af" strokeWidth={2} />
            <span style={{ color: '#0f1115', fontWeight: 700,
              fontSize: X ? 26 : 'clamp(9px, 2.6%, 26px)' }}>{user.followers}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: X ? '8px' : '0.8%' }}>
            <Briefcase size={X ? 24 : undefined} style={!X ? { width: '2.4%', height: '2.4%' } : undefined}
              color="#9ca3af" strokeWidth={2} />
            <span style={{ color: '#0f1115', fontWeight: 700,
              fontSize: X ? 26 : 'clamp(9px, 2.6%, 26px)' }}>{role}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: X ? '8px' : '0.8%' }}>
            <Layers size={X ? 24 : undefined} style={!X ? { width: '2.4%', height: '2.4%' } : undefined}
              color="#9ca3af" strokeWidth={2} />
            <span style={{ color: '#0f1115', fontWeight: 700,
              fontSize: X ? 26 : 'clamp(9px, 2.6%, 26px)' }}>{user.projects}</span>
          </div>
        </div>

        <p style={{ margin: X ? '28px 0 0' : '2.8% 0 0', color: '#c2c6cc', fontWeight: 500,
          fontSize: X ? 18 : 'clamp(6px, 1.8%, 18px)' }}>filmons.app/{user.username}</p>
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

  useEffect(() => { requestAnimationFrame(() => setVisible(true)); }, []);

  useEffect(() => {
    if (!user?.id) return;
    getPortfolioItems(user.id).then(items => setProjects(items.length));
  }, [user?.id]);

  const goBack = () => {
    setLeaving(true);
    setTimeout(() => navigate(-1), 320);
  };

  const userData: CardUser = {
    name:        user?.name        || 'Your Name',
    username:    user?.username    || 'username',
    avatar:      user?.avatar      || '',
    bio:         user?.bio         || '',
    primaryRole: user?.primaryRole || 'Creator',
    followers:   user?.followers?.length || 0,
    projects,
    isVerified:  !!user?.isVerified,
  };

  const exportCard = useCallback(async () => {
    if (!exportRef.current || exporting) return;
    setExporting(true);
    try {
      const dataUrl = await toPng(exportRef.current, {
        width:    EW,
        height:   EH,
        pixelRatio: 1,
        quality:  0.98,
        skipFonts: false,
        fetchRequestInit: { cache: 'no-cache' },
        style: { transform: 'none', borderRadius: '0' },
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

        <p className="text-center text-[9px] text-white/15 leading-relaxed tracking-wide pb-1">
          1080 × 1620 · Portrait · Instagram · Stories · LinkedIn · X · WhatsApp
        </p>

      </div>
    </div>
  );
}
