/**
 * FilmonsLoader — the full-screen cinematic FILMONS reveal.
 *
 * Reserved for genuine loading gaps (auth transition, first portfolio/
 * marketplace load) — never a fixed fake timer. Visibility is driven by
 * `ready`: the loader stays up until BOTH the minimum display time has
 * elapsed AND `ready` is true, then fades out and calls onComplete().
 * This keeps a fast connection from flashing the loader for no reason
 * while never hiding it before real data is actually available.
 */
import { useEffect, useRef, useState } from 'react';

const MIN_VISIBLE_MS = 900;
const EXIT_MS = 250;

export default function FilmonsLoader({
  ready = true,
  minDurationMs = MIN_VISIBLE_MS,
  onComplete,
}: {
  ready?: boolean;
  minDurationMs?: number;
  onComplete?: () => void;
}) {
  const [phase, setPhase] = useState<'visible' | 'exiting' | 'done'>('visible');
  const minElapsedRef = useRef(false);
  const readyRef = useRef(ready);
  readyRef.current = ready;

  const startExit = () => setPhase(p => (p === 'visible' ? 'exiting' : p));

  useEffect(() => {
    const t = setTimeout(() => {
      minElapsedRef.current = true;
      if (readyRef.current) startExit();
    }, minDurationMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (ready && minElapsedRef.current) startExit();
  }, [ready]);

  useEffect(() => {
    if (phase !== 'exiting') return;
    const t = setTimeout(() => { setPhase('done'); onComplete?.(); }, EXIT_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  if (phase === 'done') return null;

  return (
    <div
      role="status"
      aria-label="Loading Filmons"
      className={`fixed inset-0 z-[99999] flex items-center justify-center bg-[#0A0A0A] transition-opacity ease-out ${
        phase === 'exiting' ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      style={{ transitionDuration: `${EXIT_MS}ms` }}
    >
      <div className="filmons-loader__wordmark">
        FILMONS
        <span className="filmons-loader__shine" aria-hidden="true" />
      </div>
      <style>{`
        .filmons-loader__wordmark {
          position: relative;
          overflow: hidden;
          font-family: 'Neue Montreal', 'SF Pro Display', -apple-system, sans-serif;
          font-size: clamp(28px, 5vw, 54px);
          font-weight: 600;
          letter-spacing: 0.06em;
          color: #ffffff;
          animation: filmonsWordmarkIn 550ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .filmons-loader__shine {
          position: absolute;
          top: 0;
          left: -40%;
          width: 30%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent);
          transform: skewX(-20deg);
          animation: filmonsShine 750ms ease 250ms both;
        }
        @keyframes filmonsWordmarkIn {
          from { opacity: 0; transform: scale(0.98); filter: blur(6px); }
          to   { opacity: 1; transform: scale(1);    filter: blur(0); }
        }
        @keyframes filmonsShine {
          from { left: -40%; }
          to   { left: 120%; }
        }
        @media (prefers-reduced-motion: reduce) {
          .filmons-loader__wordmark { animation: filmonsFadeOnly 300ms ease both; }
          .filmons-loader__shine { display: none; }
        }
        @keyframes filmonsFadeOnly {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ── FilmonsBrandLoader ────────────────────────────────────────────────────
// General-purpose branded loading indicator — a continuously rotating ring
// in the FILMONS brand blue, with an optional visible label ("Loading",
// "Saving", "Publishing"...). Used for full-page and section-level loading
// gaps throughout the app, as distinct from the one-shot splash reveal
// above (FilmonsLoader default export, unchanged, still used by
// Login.tsx/Portfolio.tsx for the initial branded intro).
const SIZE_PX: Record<'xs' | 'sm' | 'md' | 'lg', number> = { xs: 14, sm: 18, md: 26, lg: 40 };

export function FilmonsBrandLoader({
  size = 'md',
  fullscreen = false,
  className = '',
  label,
  tone = 'brand',
}: {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  fullscreen?: boolean;
  className?: string;
  label?: string;
  /** 'brand' (blue ring, for light backgrounds) or 'light' (white ring, for dark/tinted backgrounds). */
  tone?: 'brand' | 'light';
}) {
  const px = SIZE_PX[size];
  const mark = (
    <span role="status" aria-label={label || 'Loading'} className={`filmons-spin-wrap filmons-spin-tone-${tone}`}>
      <svg width={px} height={px} viewBox="0 0 24 24" fill="none" className="filmons-spin-ring" aria-hidden="true">
        <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeOpacity="0.18" strokeWidth="3" />
        <path d="M21.5 12c0-5.25-4.25-9.5-9.5-9.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      {label && <span className="filmons-spin-label">{label}</span>}
    </span>
  );

  const content = fullscreen ? (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm ${className}`}>
      {mark}
    </div>
  ) : (
    <div className={`flex items-center justify-center ${className}`}>
      {mark}
    </div>
  );

  return (
    <>
      {content}
      <style>{`
        .filmons-spin-wrap { display: inline-flex; align-items: center; gap: 9px; }
        .filmons-spin-tone-brand { color: #2563EB; }
        .filmons-spin-tone-light { color: #FFFFFF; }
        .filmons-spin-ring { animation: filmonsSpin 0.8s linear infinite; transform-origin: 50% 50%; }
        .filmons-spin-label {
          font-family: 'Neue Montreal', 'SF Pro Display', -apple-system, sans-serif;
          font-weight: 700;
          font-size: 12.5px;
          letter-spacing: 0.02em;
          color: #64748B;
        }
        .filmons-spin-tone-light .filmons-spin-label { color: rgba(255,255,255,0.75); }
        @keyframes filmonsSpin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) {
          .filmons-spin-ring { animation: filmonsSpinPulse 1.3s ease-in-out infinite; }
        }
        @keyframes filmonsSpinPulse { 0%, 100% { opacity: .35; } 50% { opacity: 1; } }
      `}</style>
    </>
  );
}

/** Minimal dot-pulse loader for smaller in-page sections — not full-screen. */
export function FilmonsMicroLoader({ label = 'FILMONS', className = '' }: { label?: string; className?: string }) {
  return (
    <div className={`flex flex-col items-center gap-2 py-6 ${className}`}>
      <span
        className="text-xs font-semibold tracking-[0.08em] text-gray-400"
        style={{ fontFamily: "'Neue Montreal', 'SF Pro Display', -apple-system, sans-serif" }}
      >
        {label}
      </span>
      <span className="flex items-center gap-1" aria-hidden="true">
        {[0, 150, 300].map(delay => (
          <span
            key={delay}
            className="w-1.5 h-1.5 rounded-full bg-gray-300 motion-safe:animate-bounce"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </span>
    </div>
  );
}
