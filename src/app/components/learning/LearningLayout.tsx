// Shell for every route in this bundle (learning.html -- see
// learningRoutes.tsx). Renders the product header once instead of
// duplicating it per page, and shows a short branded startup splash the
// FIRST time this session lands inside Learning WITHOUT having just come
// through enterLearning()'s own transition (a direct URL visit, a
// bookmark, or a page refresh) -- per spec section 12. A proper product-
// switch entry already played the transition on the main bundle's side
// (see LearningTransitionContext) right before this bundle even loaded,
// so replaying it here too would double up -- detected via the same
// sessionStorage origin key enterLearning() writes just before navigating
// (present = arrived via a real product switch, skip; absent = direct
// entry, show it). Either way this is a one-shot per session: subsequent
// in-Learning navigation (Course -> Lesson, Discover -> Course, etc.)
// never replays it.
import { useEffect, useState } from 'react';
import { Outlet } from 'react-router';
import { LearningHeader } from './LearningHeader';
import { FilmonsLearningTransition } from './FilmonsLearningTransition';

const ENTERED_KEY = 'filmons_learning_entered';
const ORIGIN_KEY = 'filmons_learning_origin';

export function LearningLayout() {
  const [showStartup, setShowStartup] = useState(() => {
    try { return !sessionStorage.getItem(ENTERED_KEY) && !sessionStorage.getItem(ORIGIN_KEY); } catch { return false; }
  });

  useEffect(() => {
    if (!showStartup) return;
    try { sessionStorage.setItem(ENTERED_KEY, '1'); } catch {}
  }, [showStartup]);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <LearningHeader />
      <div className="flex-1">
        <Outlet />
      </div>
      {showStartup && (
        <FilmonsLearningTransition ready mode="enter" onDone={() => setShowStartup(false)} />
      )}
    </div>
  );
}
