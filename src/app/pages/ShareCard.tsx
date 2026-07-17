import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Download } from 'lucide-react';
import { toPng } from 'html-to-image';
import { useAuth } from '../context/AuthContext';
import { captureSnapshot } from '../lib/smartAnimate';

// ── Export dimensions (portrait 2:3) ──────────────────────────────────────────
const EW = 1080;
const EH = 1620;

// ── Font stacks ───────────────────────────────────────────────────────────────
const SF   = "-apple-system,'SF Pro Display',BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const NEUE = "'Neue Montreal','SF Pro Display',-apple-system,sans-serif";

// ── Themes — deep rich gradients, never going to near-white ───────────────────
const THEMES = [
  { id: 'blue',         label: 'Blue',         a: '#020818', b: '#0d1f5c', c: '#1a4dcc', d: '#3060ff' },
  { id: 'yellow',       label: 'Yellow',       a: '#0d0800', b: '#3d2200', c: '#a16207', d: '#d97706' },
  { id: 'purple',       label: 'Purple',       a: '#08001a', b: '#2a0052', c: '#6d28d9', d: '#8b5cf6' },
  { id: 'red',          label: 'Red',          a: '#0d0002', b: '#3d000c', c: '#991b1b', d: '#dc2626' },
  { id: 'black',        label: 'Black',        a: '#030303', b: '#0d0d12', c: '#1a1a24', d: '#252530' },
  { id: 'green',        label: 'Green',        a: '#010d04', b: '#0a2614', c: '#14532d', d: '#166534' },
  { id: 'pink',         label: 'Pink',         a: '#0d0008', b: '#3d0024', c: '#9d174d', d: '#be185d' },
  { id: 'light-blue',   label: 'Light Blue',   a: '#001830', b: '#003366', c: '#0284c7', d: '#38bdf8' },
  { id: 'light-purple', label: 'Light Purple', a: '#100028', b: '#30006a', c: '#7c3aed', d: '#a78bfa' },
  { id: 'orange',       label: 'Orange',       a: '#0d0500', b: '#4a1200', c: '#c2410c', d: '#f97316' },
] as const;

type ThemeId = typeof THEMES[number]['id'];
type Theme   = typeof THEMES[number];

// ── Templates ─────────────────────────────────────────────────────────────────
const TEMPLATES = [
  { id: 1, label: 'Portrait'  },
  { id: 2, label: 'Full Bleed'},
  { id: 3, label: 'Editorial' },
  { id: 4, label: 'Minimal'   },
  { id: 5, label: 'Glass'     },
  { id: 6, label: 'Cinematic' },
] as const;

type TemplateId = 1 | 2 | 3 | 4 | 5 | 6;

// ── Shared card props ─────────────────────────────────────────────────────────
interface CardUser {
  name: string;
  username: string;
  avatar: string;
  city: string;
  primaryRole: string;
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
    <div style={{ ...style, background: 'rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width="30%" height="30%" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="8" r="4" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5"/>
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    </div>
  );
}

// ── Gradient helper ───────────────────────────────────────────────────────────
const grad = (t: Theme, deg = 155) =>
  `linear-gradient(${deg}deg, ${t.a} 0%, ${t.b} 28%, ${t.c} 65%, ${t.d} 100%)`;

// ── T1 — Portrait  (large photo top, text below) ─────────────────────────────
function T1({ theme, user, isExport: X }: CP) {
  const p   = X ? '52px' : '5%';
  const role = user.primaryRole || 'Creator';
  const city = user.city || 'Worldwide';

  return (
    <div style={{
      width: X ? EW : '100%', height: X ? EH : undefined, aspectRatio: X ? undefined : '2/3',
      background: grad(theme), display: 'flex', flexDirection: 'column',
      padding: p, gap: X ? '28px' : '2.8%',
      overflow: 'hidden', fontFamily: SF,
    }}>
      {/* Photo: ~59% of card height */}
      <div style={{
        height: X ? `${Math.round(EH * 0.59)}px` : '59%', flexShrink: 0,
        borderRadius: X ? 24 : 'clamp(12px, 2.4%, 24px)',
        overflow: 'hidden',
        boxShadow: '0 24px 60px rgba(0,0,0,0.55), 0 4px 16px rgba(0,0,0,0.3)',
      }}>
        <Photo src={user.avatar} alt={user.name} style={{ width: '100%', height: '100%' }} />
      </div>

      {/* Content below photo */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 0 }}>
        <div>
          <p style={{ margin: 0, color: 'white', fontWeight: 700, letterSpacing: '-0.015em', lineHeight: 1.1,
            fontSize: X ? 52 : 'clamp(18px, 5.2%, 52px)' }}>{user.name}</p>
          <p style={{ margin: `${X ? '5px' : '0.5%'} 0 ${X ? '18px' : '1.8%'}`,
            color: 'rgba(255,255,255,0.4)', fontWeight: 400,
            fontSize: X ? 24 : 'clamp(9px, 2.4%, 24px)' }}>@{user.username}</p>

          <p style={{ margin: 0, color: 'rgba(255,255,255,0.38)',
            fontSize: X ? 19 : 'clamp(7px, 1.9%, 19px)' }}>Hi, I'm a</p>
          <p style={{ margin: `${X ? '2px' : '0.2%'} 0 ${X ? '14px' : '1.4%'}`,
            color: 'white', fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.05,
            fontSize: X ? 44 : 'clamp(15px, 4.4%, 44px)' }}>{role}</p>
          <p style={{ margin: 0, color: 'rgba(255,255,255,0.35)',
            fontSize: X ? 19 : 'clamp(7px, 1.9%, 19px)' }}>{city}</p>
        </div>

        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: X ? '18px' : '1.8%',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        }}>
          <div>
            <p style={{ margin: `0 0 ${X ? '4px' : '0.4%'}`, color: 'rgba(255,255,255,0.28)',
              fontSize: X ? 15 : 'clamp(6px, 1.5%, 15px)' }}>🔗 View my Filmons portfolio</p>
            <p style={{ margin: 0, color: 'rgba(255,255,255,0.65)', fontWeight: 600,
              fontSize: X ? 20 : 'clamp(7px, 2%, 20px)' }}>filmons.app/{user.username}</p>
          </div>
          <span style={{ fontFamily: NEUE, fontWeight: 800, letterSpacing: '0.16em',
            color: 'rgba(255,255,255,0.18)', fontSize: X ? 14 : 'clamp(5px, 1.4%, 14px)',
            textTransform: 'uppercase' as const }}>FILMONS</span>
        </div>
      </div>
    </div>
  );
}

// ── T2 — Full Bleed  (photo edge-to-edge, gradient text overlay) ──────────────
function T2({ theme, user, isExport: X }: CP) {
  const p    = X ? '52px' : '5%';
  const role = user.primaryRole || 'Creator';
  const city = user.city || 'Worldwide';

  return (
    <div style={{
      width: X ? EW : '100%', height: X ? EH : undefined, aspectRatio: X ? undefined : '2/3',
      position: 'relative', overflow: 'hidden', fontFamily: SF,
    }}>
      <Photo src={user.avatar} alt={user.name}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />

      {/* Overlay: theme tint at top fading to near-black at bottom */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `linear-gradient(to bottom, ${theme.b}99 0%, transparent 30%, rgba(0,0,0,0.25) 52%, rgba(0,0,0,0.88) 82%, rgba(0,0,0,0.97) 100%)`,
      }} />

      {/* FILMONS — top left */}
      <div style={{ position: 'absolute', top: p, left: p }}>
        <span style={{ fontFamily: NEUE, fontWeight: 800, letterSpacing: '0.18em',
          color: 'rgba(255,255,255,0.75)', fontSize: X ? 16 : 'clamp(6px, 1.6%, 16px)',
          textTransform: 'uppercase' as const,
          textShadow: '0 2px 12px rgba(0,0,0,0.6)' }}>FILMONS</span>
      </div>

      {/* Text — bottom */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: p }}>
        <p style={{ margin: `0 0 ${X ? '3px' : '0.3%'}`, color: 'rgba(255,255,255,0.45)',
          fontSize: X ? 19 : 'clamp(7px, 1.9%, 19px)' }}>Hi, I'm a</p>
        <p style={{ margin: `0 0 ${X ? '10px' : '1%'}`, color: 'white', fontWeight: 800,
          letterSpacing: '-0.025em', lineHeight: 1.03,
          fontSize: X ? 66 : 'clamp(22px, 6.6%, 66px)' }}>{role}</p>
        <p style={{ margin: `0 0 ${X ? '3px' : '0.3%'}`, color: 'white', fontWeight: 700,
          fontSize: X ? 38 : 'clamp(13px, 3.8%, 38px)', letterSpacing: '-0.01em' }}>{user.name}</p>
        <p style={{ margin: `0 0 ${X ? '20px' : '2%'}`, color: 'rgba(255,255,255,0.42)',
          fontSize: X ? 22 : 'clamp(8px, 2.2%, 22px)' }}>@{user.username} · {city}</p>
        <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)', margin: `0 0 ${X ? '18px' : '1.8%'}` }} />
        <p style={{ margin: 0, color: 'rgba(255,255,255,0.5)', fontWeight: 500,
          fontSize: X ? 19 : 'clamp(7px, 1.9%, 19px)' }}>filmons.app/{user.username}</p>
      </div>
    </div>
  );
}

// ── T3 — Editorial  (role as enormous headline — the aesthetic risk) ───────────
function T3({ theme, user, isExport: X }: CP) {
  const p    = X ? '52px' : '5%';
  const role = (user.primaryRole || 'Creator').toUpperCase();
  const city = user.city || 'Worldwide';

  return (
    <div style={{
      width: X ? EW : '100%', height: X ? EH : undefined, aspectRatio: X ? undefined : '2/3',
      background: grad(theme), display: 'flex', flexDirection: 'column',
      overflow: 'hidden', fontFamily: SF,
    }}>
      {/* Photo — top 44% */}
      <div style={{
        height: X ? `${Math.round(EH * 0.44)}px` : '44%', flexShrink: 0,
        overflow: 'hidden', position: 'relative',
      }}>
        <Photo src={user.avatar} alt={user.name} style={{ width: '100%', height: '100%' }} />
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: '40%',
          background: 'linear-gradient(to bottom, transparent, rgba(0,0,0,0.22))',
        }} />
      </div>

      {/* Editorial body */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        padding: p, paddingTop: X ? '38px' : '3.8%',
      }}>
        <div>
          {/* Role name at 90px — deliberately large, clips for very long strings */}
          <p style={{
            margin: `0 0 ${X ? '18px' : '1.8%'}`,
            color: 'white', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 0.88,
            fontSize: X ? 90 : 'clamp(28px, 9%, 90px)',
            overflow: 'hidden',
          }}>{role}</p>

          <div style={{ display: 'flex', alignItems: 'center', gap: X ? '14px' : '1.4%', margin: `0 0 ${X ? '14px' : '1.4%'}` }}>
            <div style={{ width: X ? '36px' : '3.6%', height: '1.5px', background: 'rgba(255,255,255,0.35)', flexShrink: 0 }} />
            <p style={{ margin: 0, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.13em',
              textTransform: 'uppercase' as const, fontSize: X ? 13 : 'clamp(5px, 1.3%, 13px)' }}>Creator Profile</p>
          </div>

          <p style={{ margin: `0 0 ${X ? '3px' : '0.3%'}`, color: 'white', fontWeight: 700,
            letterSpacing: '-0.01em', fontSize: X ? 38 : 'clamp(13px, 3.8%, 38px)' }}>{user.name}</p>
          <p style={{ margin: 0, color: 'rgba(255,255,255,0.38)',
            fontSize: X ? 21 : 'clamp(8px, 2.1%, 21px)' }}>@{user.username} · {city}</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <p style={{ margin: 0, color: 'rgba(255,255,255,0.38)',
            fontSize: X ? 18 : 'clamp(7px, 1.8%, 18px)' }}>filmons.app/{user.username}</p>
          <span style={{ fontFamily: NEUE, fontWeight: 800, letterSpacing: '0.16em',
            color: 'rgba(255,255,255,0.16)', fontSize: X ? 14 : 'clamp(5px, 1.4%, 14px)',
            textTransform: 'uppercase' as const }}>FILMONS</span>
        </div>
      </div>
    </div>
  );
}

// ── T4 — Minimal  (centered, circular photo, accent divider) ──────────────────
function T4({ theme, user, isExport: X }: CP) {
  const p    = X ? '68px' : '6.5%';
  const role = user.primaryRole || 'Creator';
  const city = user.city || 'Worldwide';
  const diam = X ? Math.round(EW * 0.38) : undefined;

  return (
    <div style={{
      width: X ? EW : '100%', height: X ? EH : undefined, aspectRatio: X ? undefined : '2/3',
      background: grad(theme, 165), display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: p, overflow: 'hidden', fontFamily: SF,
    }}>
      {/* Circular photo */}
      <div style={{
        width: X ? `${diam}px` : '38%',
        height: X ? `${diam}px` : undefined,
        aspectRatio: X ? undefined : '1/1',
        borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
        marginBottom: X ? '44px' : '4.4%',
        boxShadow: '0 20px 56px rgba(0,0,0,0.5), 0 0 0 2px rgba(255,255,255,0.1)',
      }}>
        <Photo src={user.avatar} alt={user.name} style={{ width: '100%', height: '100%' }} />
      </div>

      <div style={{ textAlign: 'center', width: '100%' }}>
        <p style={{ margin: `0 0 ${X ? '6px' : '0.6%'}`, color: 'white', fontWeight: 700, letterSpacing: '-0.01em',
          fontSize: X ? 52 : 'clamp(17px, 5.2%, 52px)' }}>{user.name}</p>
        <p style={{ margin: `0 0 ${X ? '38px' : '3.8%'}`, color: 'rgba(255,255,255,0.38)',
          fontSize: X ? 23 : 'clamp(8px, 2.3%, 23px)' }}>@{user.username}</p>

        {/* Accent divider — uses theme d color as a deliberate choice */}
        <div style={{
          width: X ? '44px' : '4.4%', height: '2px', background: theme.d,
          margin: `0 auto ${X ? '34px' : '3.4%'}`, borderRadius: '2px',
        }} />

        <p style={{ margin: `0 0 ${X ? '4px' : '0.4%'}`, color: 'rgba(255,255,255,0.35)',
          fontSize: X ? 18 : 'clamp(6px, 1.8%, 18px)' }}>Hi, I'm a</p>
        <p style={{ margin: `0 0 ${X ? '18px' : '1.8%'}`, color: 'white', fontWeight: 800, letterSpacing: '-0.02em',
          fontSize: X ? 40 : 'clamp(14px, 4%, 40px)' }}>{role}</p>
        <p style={{ margin: `0 0 ${X ? '52px' : '5.2%'}`, color: 'rgba(255,255,255,0.32)',
          fontSize: X ? 18 : 'clamp(6px, 1.8%, 18px)' }}>{city}</p>

        <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: `0 0 ${X ? '20px' : '2%'}` }} />
        <p style={{ margin: `0 0 ${X ? '68px' : '6.8%'}`, color: 'rgba(255,255,255,0.38)',
          fontSize: X ? 18 : 'clamp(6px, 1.8%, 18px)' }}>filmons.app/{user.username}</p>

        <span style={{ fontFamily: NEUE, fontWeight: 800, letterSpacing: '0.18em',
          color: 'rgba(255,255,255,0.16)', fontSize: X ? 15 : 'clamp(5px, 1.5%, 15px)',
          textTransform: 'uppercase' as const }}>FILMONS</span>
      </div>
    </div>
  );
}

// ── T5 — Glass  (photo in frosted frame, glass info cards below) ──────────────
function T5({ theme, user, isExport: X }: CP) {
  const p    = X ? '44px' : '4.4%';
  const role = user.primaryRole || 'Creator';
  const city = user.city || 'Worldwide';

  const glass: React.CSSProperties = {
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.14)',
  };

  return (
    <div style={{
      width: X ? EW : '100%', height: X ? EH : undefined, aspectRatio: X ? undefined : '2/3',
      background: grad(theme, 148), display: 'flex', flexDirection: 'column',
      padding: p, gap: X ? '18px' : '1.8%',
      overflow: 'hidden', fontFamily: SF,
    }}>
      {/* Photo in glass frame */}
      <div style={{
        ...glass,
        height: X ? `${Math.round(EH * 0.53)}px` : '53%', flexShrink: 0,
        borderRadius: X ? 22 : 'clamp(10px, 2.2%, 22px)',
        overflow: 'hidden',
        padding: X ? '10px' : '1%',
      }}>
        <div style={{ width: '100%', height: '100%', borderRadius: X ? 13 : 'clamp(5px, 1.3%, 13px)', overflow: 'hidden' }}>
          <Photo src={user.avatar} alt={user.name} style={{ width: '100%', height: '100%' }} />
        </div>
      </div>

      {/* Name glass card */}
      <div style={{ ...glass, borderRadius: X ? 18 : 'clamp(8px, 1.8%, 18px)', padding: X ? '18px 22px' : '1.8% 2.2%' }}>
        <p style={{ margin: `0 0 ${X ? '3px' : '0.3%'}`, color: 'white', fontWeight: 700, letterSpacing: '-0.01em',
          fontSize: X ? 44 : 'clamp(15px, 4.4%, 44px)' }}>{user.name}</p>
        <p style={{ margin: 0, color: 'rgba(255,255,255,0.4)',
          fontSize: X ? 21 : 'clamp(8px, 2.1%, 21px)' }}>@{user.username}</p>
      </div>

      {/* Role + location glass card */}
      <div style={{
        ...glass, borderRadius: X ? 18 : 'clamp(8px, 1.8%, 18px)', padding: X ? '15px 22px' : '1.5% 2.2%',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <p style={{ margin: `0 0 ${X ? '2px' : '0.2%'}`, color: 'rgba(255,255,255,0.35)',
            fontSize: X ? 16 : 'clamp(6px, 1.6%, 16px)' }}>Hi, I'm a</p>
          <p style={{ margin: 0, color: 'white', fontWeight: 800, letterSpacing: '-0.01em',
            fontSize: X ? 29 : 'clamp(10px, 2.9%, 29px)' }}>{role}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ margin: `0 0 ${X ? '2px' : '0.2%'}`, color: 'rgba(255,255,255,0.35)',
            fontSize: X ? 15 : 'clamp(6px, 1.5%, 15px)' }}>Based in</p>
          <p style={{ margin: 0, color: 'rgba(255,255,255,0.8)', fontWeight: 600,
            fontSize: X ? 20 : 'clamp(7px, 2%, 20px)' }}>{city}</p>
        </div>
      </div>

      {/* Portfolio link + logo */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <p style={{ margin: 0, color: 'rgba(255,255,255,0.38)',
          fontSize: X ? 18 : 'clamp(7px, 1.8%, 18px)' }}>filmons.app/{user.username}</p>
        <span style={{ fontFamily: NEUE, fontWeight: 800, letterSpacing: '0.16em',
          color: 'rgba(255,255,255,0.16)', fontSize: X ? 14 : 'clamp(5px, 1.4%, 14px)',
          textTransform: 'uppercase' as const }}>FILMONS</span>
      </div>
    </div>
  );
}

// ── T6 — Cinematic  (letterbox bars, film-credits typography) ─────────────────
function T6({ theme, user, isExport: X }: CP) {
  const role = user.primaryRole || 'Creator';
  const city = user.city || 'Worldwide';

  // Heights: top bar 10% | photo 44% | bottom bar 10% | credits 36%
  const barH   = X ? Math.round(EH * 0.10) : undefined;
  const photoH = X ? Math.round(EH * 0.44) : undefined;

  return (
    <div style={{
      width: X ? EW : '100%', height: X ? EH : undefined, aspectRatio: X ? undefined : '2/3',
      background: '#040404', display: 'flex', flexDirection: 'column',
      overflow: 'hidden', fontFamily: SF,
    }}>
      {/* Top letterbox */}
      <div style={{
        height: X ? `${barH}px` : '10%', background: '#000', flexShrink: 0,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        paddingBottom: X ? '14px' : '1.4%',
      }}>
        <span style={{ fontFamily: NEUE, fontWeight: 800, letterSpacing: '0.22em',
          color: 'rgba(255,255,255,0.55)', fontSize: X ? 14 : 'clamp(5px, 1.4%, 14px)',
          textTransform: 'uppercase' as const }}>FILMONS PRESENTS</span>
      </div>

      {/* Photo */}
      <div style={{ height: X ? `${photoH}px` : '44%', flexShrink: 0, overflow: 'hidden', position: 'relative' }}>
        <Photo src={user.avatar} alt={user.name} style={{ width: '100%', height: '100%' }} />
        {/* Subtle theme-colored grade overlay */}
        <div style={{
          position: 'absolute', inset: 0,
          background: `linear-gradient(135deg, ${theme.c}1a 0%, transparent 55%, ${theme.d}14 100%)`,
        }} />
      </div>

      {/* Bottom letterbox */}
      <div style={{ height: X ? `${barH}px` : '10%', background: '#000', flexShrink: 0 }} />

      {/* Credits */}
      <div style={{
        flex: 1,
        background: `linear-gradient(158deg, ${theme.a} 0%, ${theme.b} 55%, ${theme.c}66 100%)`,
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: X ? '44px 52px' : '4.4% 5.2%', gap: X ? '9px' : '0.9%',
      }}>
        <p style={{ margin: 0, color: 'rgba(255,255,255,0.28)', letterSpacing: '0.22em',
          textTransform: 'uppercase' as const, fontSize: X ? 12 : 'clamp(4px, 1.2%, 12px)' }}>Directed by</p>
        <p style={{ margin: `0 0 ${X ? '14px' : '1.4%'}`, color: 'white', fontWeight: 800, letterSpacing: '-0.015em',
          lineHeight: 1.08, fontSize: X ? 58 : 'clamp(19px, 5.8%, 58px)' }}>{user.name}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: X ? '14px' : '1.4%' }}>
          <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.08)' }} />
          <p style={{ margin: 0, color: 'rgba(255,255,255,0.4)',
            fontSize: X ? 17 : 'clamp(6px, 1.7%, 17px)', whiteSpace: 'nowrap' as const }}>
            {role} · {city}</p>
          <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.08)' }} />
        </div>
        <p style={{ margin: `${X ? '10px' : '1%'} 0 0`, color: 'rgba(255,255,255,0.35)',
          fontSize: X ? 17 : 'clamp(6px, 1.7%, 17px)' }}>filmons.app/{user.username}</p>
      </div>
    </div>
  );
}

// ── Template renderer map ──────────────────────────────────────────────────────
const RENDERERS: Record<TemplateId, React.ComponentType<CP>> = {
  1: T1, 2: T2, 3: T3, 4: T4, 5: T5, 6: T6,
};

// ── Theme swatch ──────────────────────────────────────────────────────────────
function ThemeSwatch({ theme, selected, onClick }: { theme: Theme; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="relative overflow-hidden transition-all active:scale-95"
      style={{
        aspectRatio: '2/3', width: '100%',
        background: `linear-gradient(155deg, ${theme.a} 0%, ${theme.b} 28%, ${theme.c} 65%, ${theme.d} 100%)`,
        border: selected ? '2px solid white' : '2px solid transparent',
        borderRadius: '8px',
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

// ── Main page ─────────────────────────────────────────────────────────────────
export function ShareCard() {
  const { user }   = useAuth();
  const navigate    = useNavigate();
  const exportRef   = useRef<HTMLDivElement>(null);
  const [themeId,    setThemeId]    = useState<ThemeId>('green');
  const [templateId, setTemplateId] = useState<TemplateId>(1);
  const [exporting,  setExporting]  = useState(false);

  const theme  = THEMES.find(t => t.id === themeId) ?? THEMES[5];
  const CardFn = RENDERERS[templateId];

  const userData: CardUser = {
    name:        user?.name        || 'Your Name',
    username:    user?.username    || 'username',
    avatar:      user?.avatar      || '',
    city:        user?.city        || user?.location || '',
    primaryRole: user?.primaryRole || 'Creator',
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
    <div className="min-h-screen bg-[#050505] pb-24">

      {/* Header */}
      <div className="sticky top-0 z-30 bg-[#050505]/90 backdrop-blur-md border-b border-white/[0.06] px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => { captureSnapshot(); navigate(-1); }}
          className="w-8 h-8 flex items-center justify-center text-white/35 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4"/>
        </button>
        <h1 className="text-sm font-bold text-white flex-1 tracking-wide"
          style={{ fontFamily: NEUE }}>Share Card</h1>
        <button
          onClick={exportCard}
          disabled={exporting}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-gray-950 text-xs font-bold rounded-lg disabled:opacity-40 transition-all active:scale-95"
        >
          {exporting
            ? <div className="w-3 h-3 border-2 border-gray-950 border-t-transparent rounded-full animate-spin"/>
            : <Download className="w-3 h-3"/>}
          Export PNG
        </button>
      </div>

      <div className="max-w-sm mx-auto px-4 pt-5 space-y-4">

        {/* Hidden export target — offscreen, exact pixel dimensions */}
        <div
          ref={exportRef}
          style={{
            position: 'absolute', left: '-9999px', top: '-9999px',
            width: `${EW}px`, height: `${EH}px`, pointerEvents: 'none',
          }}
        >
          <CardFn theme={theme} user={userData} isExport />
        </div>

        {/* Preview */}
        <div
          className="w-full rounded-2xl overflow-hidden"
          style={{ boxShadow: `0 32px 80px ${theme.c}40, 0 4px 20px rgba(0,0,0,0.6)` }}
        >
          <CardFn theme={theme} user={userData} />
        </div>

        {/* Template selector */}
        <div className="rounded-xl bg-white/[0.04] border border-white/[0.07] p-4">
          <p className="text-[9px] font-semibold text-white/20 uppercase tracking-[0.18em] mb-3">Layout</p>
          <div className="grid grid-cols-3 gap-2">
            {TEMPLATES.map(t => (
              <button
                key={t.id} type="button"
                onClick={() => setTemplateId(t.id as TemplateId)}
                className={`py-2 px-2.5 rounded-lg text-xs font-semibold transition-all ${
                  templateId === t.id
                    ? 'bg-white text-gray-950'
                    : 'bg-white/5 text-white/40 hover:bg-white/8 hover:text-white/70'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Theme selector */}
        <div className="rounded-xl bg-white/[0.04] border border-white/[0.07] p-4">
          <p className="text-[9px] font-semibold text-white/20 uppercase tracking-[0.18em] mb-3">Theme</p>
          <div className="grid grid-cols-5 gap-2.5">
            {THEMES.map(t => (
              <div key={t.id} className="flex flex-col items-center gap-1.5">
                <ThemeSwatch
                  theme={t}
                  selected={themeId === t.id}
                  onClick={() => setThemeId(t.id)}
                />
                <span className="text-[8px] text-white/28 font-medium text-center leading-tight">
                  {t.label}
                </span>
              </div>
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
