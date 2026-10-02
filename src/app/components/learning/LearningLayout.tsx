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
import { Outlet, useLocation } from 'react-router';
import { LearningHeader } from './LearningHeader';
import { FilmonsLearningTransition } from './FilmonsLearningTransition';

const ENTERED_KEY = 'filmons_learning_entered';
const ORIGIN_KEY = 'filmons_learning_origin';

// Course Detail gets an immersive layout -- global FILMONS chrome was
// already never mounted here (separate bundle), and per spec this
// bundle's OWN header is hidden too, leaving just the course's own local
// sticky header + Enroll/Continue CTA. Matches exactly `course/:courseId`
// (useLocation().pathname is already basename-relative), not its
// `/content` or `/lesson/:lessonId` children -- those keep the shared
// header, only the detail page itself goes immersive.
const COURSE_DETAIL_PATH = /^\/course\/[^/]+\/?$/;

export function LearningLayout() {
  const location = useLocation();
  const hideHeader = COURSE_DETAIL_PATH.test(location.pathname);
  const [showStartup, setShowStartup] = useState(() => {
    try { return !sessionStorage.getItem(ENTERED_KEY) && !sessionStorage.getItem(ORIGIN_KEY); } catch { return false; }
  });

  useEffect(() => {
    if (!showStartup) return;
    try { sessionStorage.setItem(ENTERED_KEY, '1'); } catch {}
  }, [showStartup]);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {!hideHeader && <LearningHeader />}
      <div className="flex-1">
        <Outlet />
      </div>
      {showStartup && (
        <FilmonsLearningTransition ready mode="enter" onDone={() => setShowStartup(false)} />
      )}
    </div>
  );
}
