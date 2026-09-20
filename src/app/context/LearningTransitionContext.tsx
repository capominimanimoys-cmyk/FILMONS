// Global "Filmons -> Filmons Learning" product-switch transition -- hoisted
// at Root.tsx exactly like PortfolioPreviewContext, so it survives the
// route change it triggers (a component owning this as local state would
// unmount itself the instant navigate() fires). enterLearning() starts the
// real navigation immediately (per spec: never artificially delay loading
// just to show the animation) while the branded overlay plays on top of
// it; leaveLearning() plays the shorter reverse sequence and restores the
// Filmons context the user left from.
import { createContext, useContext, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { FilmonsLearningTransition } from '../components/learning/FilmonsLearningTransition';

interface LearningOrigin {
  route: string;
  scrollY: number;
}

interface LearningTransitionContextValue {
  /** Navigate into Filmons Learning with the branded product-switch
   *  transition. `origin` is remembered so a later leaveLearning() can
   *  return to it -- omit to leave whatever origin is already stored
   *  untouched (e.g. navigating between two Learning-triggering entry
   *  points without ever having left Learning in between). */
  enterLearning: (path: string, origin?: { route: string }) => void;
  /** Returns to the remembered origin (or /home if none) with the
   *  shorter reverse transition. */
  leaveLearning: () => void;
}

const LearningTransitionContext = createContext<LearningTransitionContextValue | null>(null);

export function useLearningTransition(): LearningTransitionContextValue {
  const ctx = useContext(LearningTransitionContext);
  if (!ctx) throw new Error('useLearningTransition must be used within LearningTransitionProvider');
  return ctx;
}

const ORIGIN_KEY = 'filmons_learning_origin';

export function LearningTransitionProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [overlay, setOverlay] = useState<{ mode: 'enter' | 'exit'; targetPath: string } | null>(null);
  const navigatedRef = useRef(false);

  const enterLearning = (path: string, origin?: { route: string }) => {
    if (overlay) return; // guard against double-tap mid-transition
    if (origin) {
      try { sessionStorage.setItem(ORIGIN_KEY, JSON.stringify({ route: origin.route, scrollY: window.scrollY })); } catch {}
    }
    navigatedRef.current = false;
    setOverlay({ mode: 'enter', targetPath: path });
    // Start the real navigation immediately -- the overlay plays on top,
    // it never gates when loading actually begins.
    navigate(path);
  };

  const leaveLearning = () => {
    if (overlay) return;
    let origin: LearningOrigin | null = null;
    try {
      const raw = sessionStorage.getItem(ORIGIN_KEY);
      if (raw) origin = JSON.parse(raw);
      sessionStorage.removeItem(ORIGIN_KEY);
    } catch {}
    setOverlay({ mode: 'exit', targetPath: origin?.route ?? '/home' });
    navigate(origin?.route ?? '/home');
    if (origin?.scrollY) {
      requestAnimationFrame(() => { setTimeout(() => window.scrollTo({ top: origin!.scrollY }), 0); });
    }
  };

  return (
    <LearningTransitionContext.Provider value={{ enterLearning, leaveLearning }}>
      {children}
      {overlay && (
        <FilmonsLearningTransition
          mode={overlay.mode}
          ready
          onDone={() => setOverlay(null)}
        />
      )}
    </LearningTransitionContext.Provider>
  );
}
