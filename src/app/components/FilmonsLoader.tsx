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
