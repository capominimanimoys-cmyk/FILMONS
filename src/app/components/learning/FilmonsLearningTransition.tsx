// The branded "Filmons -> Filmons Learning" product-switch transition --
// shown full-screen whenever the user moves from the main Filmons product
// into /learning/*, per the Learning Product Entry spec. Deliberately NOT
// a generic spinner: a staged brand reveal (FILMONS -> FILMONS LEARNING ->
// tagline -> thin progress line) so the moment reads as "entering another
// Filmons product," not "this page is loading."
//
// Timing is a minimum, not a fixed wait -- `ready` (the destination's data)
// can flip true at any point; this only ever holds a touch past the point
// where the brand reveal has had time to register (~900ms), never longer
// than necessary (spec: "do not artificially hold the loading screen if
// the page is already ready for too long").
import { useEffect, useRef, useState } from 'react';

type Phase = 'dim' | 'brand' | 'reveal' | 'tagline' | 'complete';

const REDUCED_MOTION_MS = 450;
// "Back to Filmons" is deliberately shorter (spec section 15) -- it starts
// already fully revealed and only plays the collapse, not the full
// build-up, so leaving Learning never feels slower than entering it did.
const EXIT_MS = 500;

function prefersReducedMotion(): boolean {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

export function FilmonsLearningTransition({ ready, onDone, mode = 'enter' }: { ready: boolean; onDone: () => void; mode?: 'enter' | 'exit' }) {
  const reduced = useRef(prefersReducedMotion()).current;
  const [phase, setPhase] = useState<Phase>(mode === 'exit' ? 'tagline' : 'dim');
  const readyRef = useRef(ready);
  readyRef.current = ready;

  useEffect(() => {
    if (mode === 'exit') {
      // Starts fully shown (FILMONS LEARNING + tagline), holds briefly,
      // then collapses straight to just FILMONS before fading out --
      // never replays the enter sequence's build-up.
      const t = setTimeout(() => setPhase('brand'), reduced ? REDUCED_MOTION_MS : EXIT_MS);
      const t2 = setTimeout(() => setPhase('complete'), (reduced ? REDUCED_MOTION_MS : EXIT_MS) + 200);
      return () => { clearTimeout(t); clearTimeout(t2); };
    }
    if (reduced) {
      // Minimal, static version -- no logo movement, just a brief branded
      // hold long enough to register "Filmons Learning" before handing off.
      setPhase('tagline');
      const t = setTimeout(() => setPhase('complete'), REDUCED_MOTION_MS);
      return () => clearTimeout(t);
    }
    const timers = [
      setTimeout(() => setPhase('brand'),   250),
      setTimeout(() => setPhase('reveal'),  500),
      setTimeout(() => setPhase('tagline'), 850),
      // Floor of the sequence -- only actually completes once `ready` is
      // also true (see the effect below); this just guarantees the reveal
      // has fully played before that check can fire.
      setTimeout(() => setPhase('complete'), 1200),
    ];
    return () => timers.forEach(clearTimeout);
  }, [reduced, mode]);

  // Completing means "the brand sequence has played AND the destination is
  // ready" -- whichever finishes second. Polling on `ready` rather than a
  // one-shot check because `ready` can flip true well after 'complete' is
  // first reached (slow data), in which case this fires the instant it does.
  useEffect(() => {
    if (phase !== 'complete') return;
    if (readyRef.current) { onDone(); return; }
    const id = setInterval(() => { if (readyRef.current) { clearInterval(id); onDone(); } }, 80);
    return () => clearInterval(id);
  }, [phase, onDone]);

  const showBrand = phase !== 'dim';
  // Exit collapses back down (LEARNING + tagline visible only in 'tagline',
  // the mode's starting phase) rather than building up like enter does.
  const showLearning = mode === 'exit'
    ? phase === 'tagline'
    : (phase === 'reveal' || phase === 'tagline' || phase === 'complete' || reduced);
  const showTagline = mode === 'exit'
    ? phase === 'tagline'
    : (phase === 'tagline' || phase === 'complete' || reduced);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-white"
      style={{
        opacity: phase === 'dim' ? 0 : 1,
        transition: reduced ? 'opacity 150ms ease' : 'opacity 250ms ease',
      }}
      role="status"
      aria-live="polite"
      aria-label="Loading Filmons Learning"
    >
      <div className="flex flex-col items-center">
        <div
          className="text-center"
          style={{
            opacity: showBrand ? 1 : 0,
            transform: reduced ? 'none' : `translateY(${showBrand ? 0 : 8}px)`,
            transition: reduced ? 'opacity 150ms ease' : 'opacity 400ms ease, transform 400ms ease',
          }}
        >
          <p className="text-2xl sm:text-3xl font-black tracking-[0.2em] text-gray-900">FILMONS</p>
          <p
            className="text-2xl sm:text-3xl font-black tracking-[0.2em] text-blue-600 overflow-hidden"
            style={{
              maxHeight: showLearning ? 60 : 0,
              opacity: showLearning ? 1 : 0,
              transition: reduced ? 'none' : 'max-height 350ms cubic-bezier(0.22,0.8,0.22,1), opacity 350ms ease',
            }}
          >
            LEARNING
          </p>
        </div>

        <p
          className="mt-4 text-xs font-semibold text-gray-400 tracking-wide"
          style={{
            opacity: showTagline ? 1 : 0,
            transform: reduced ? 'none' : `translateY(${showTagline ? 0 : 6}px)`,
            transition: reduced ? 'opacity 150ms ease' : 'opacity 350ms ease, transform 350ms ease',
          }}
        >
          Learn. Create. Grow.
        </p>

        <div className="mt-6 w-32 h-[3px] rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-full bg-blue-600 rounded-full"
            style={{
              width: showTagline ? '100%' : '15%',
              transition: reduced ? 'width 300ms ease' : 'width 900ms cubic-bezier(0.22,0.8,0.22,1)',
            }}
          />
        </div>
      </div>
    </div>
  );
}
