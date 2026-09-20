// Global "Filmons <-> Filmons Learning" product-switch transition.
// Filmons Learning is a REAL separate Rollup bundle/router (see
// learning.html/learningRoutes.tsx) reachable ONLY at learning.filmons.app
// -- there is no filmons.app/learning path anymore (see learningOrigin.ts;
// the one exception is a localhost-only dev fallback). Crossing between
// the two products is therefore always a real CROSS-ORIGIN navigation in
// production (window.location.href), never a React Router route change.
// This provider is importable from either bundle's root (App.tsx /
// LearningApp.tsx) so the same hook works wherever a CourseCard or the
// Learning header happens to render. `path` arguments are always relative
// to the DESTINATION product's own basename ('/' there) -- never prefix
// them with '/learning' yourself, learningOrigin()/filmonsOrigin() supply
// the right host.
import { createContext, useContext, useState, type ReactNode } from 'react';
import { FilmonsLearningTransition } from '../components/learning/FilmonsLearningTransition';
import { learningOrigin, filmonsOrigin } from '../lib/learningOrigin';

interface LearningOrigin {
  route: string;
  scrollY: number;
}

interface LearningTransitionContextValue {
  /** Cross into Filmons Learning with the branded product-switch
   *  transition. `origin` is remembered (sessionStorage survives the hard
   *  navigation) so a later leaveLearning() can return to it -- omit to
   *  leave whatever origin is already stored untouched. */
  enterLearning: (path: string, origin?: { route: string }) => void;
  /** Cross back to Filmons with the shorter reverse transition. Omit
   *  `path` to return to the remembered origin (or /home if none). */
  leaveLearning: (path?: string) => void;
}

const LearningTransitionContext = createContext<LearningTransitionContextValue | null>(null);

export function useLearningTransition(): LearningTransitionContextValue {
  const ctx = useContext(LearningTransitionContext);
  if (!ctx) throw new Error('useLearningTransition must be used within LearningTransitionProvider');
  return ctx;
}

const ORIGIN_KEY = 'filmons_learning_origin';
// Consumed once by Root.tsx on mount to restore scroll position after a
// hard navigation back from Learning -- see leaveLearning() below.
export const LEARNING_RESTORE_SCROLL_KEY = 'filmons_learning_restore_scroll';
const RESTORE_SCROLL_KEY = LEARNING_RESTORE_SCROLL_KEY;

export function LearningTransitionProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<'enter' | 'exit' | null>(null);

  const enterLearning = (path: string, origin?: { route: string }) => {
    if (mode) return; // guard against double-tap mid-transition
    if (origin) {
      try { sessionStorage.setItem(ORIGIN_KEY, JSON.stringify({ route: origin.route, scrollY: window.scrollY } satisfies LearningOrigin)); } catch {}
    }
    setMode('enter');
    // A real cross-origin navigation -- starts immediately so the browser
    // is already fetching the destination while the overlay plays on top
    // of whatever's currently rendered (never gated behind the animation
    // finishing, per spec). `path` is relative to Learning's own root
    // ('/course/xyz', not '/learning/course/xyz').
    window.location.href = learningOrigin() + path;
  };

  const leaveLearning = (path?: string) => {
    if (mode) return;
    let origin: LearningOrigin | null = null;
    try {
      const raw = sessionStorage.getItem(ORIGIN_KEY);
      if (raw) origin = JSON.parse(raw);
      sessionStorage.removeItem(ORIGIN_KEY);
      // Left for the main bundle to consume on mount (see Root.tsx) --
      // scroll position can't survive a hard navigation any other way.
      if (origin?.scrollY) sessionStorage.setItem(RESTORE_SCROLL_KEY, String(origin.scrollY));
    } catch {}
    setMode('exit');
    window.location.href = filmonsOrigin() + (path ?? origin?.route ?? '/home');
  };

  return (
    <LearningTransitionContext.Provider value={{ enterLearning, leaveLearning }}>
      {children}
      {mode && <FilmonsLearningTransition mode={mode} ready onDone={() => setMode(null)} />}
    </LearningTransitionContext.Provider>
  );
}
