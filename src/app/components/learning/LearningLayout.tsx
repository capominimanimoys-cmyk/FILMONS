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
import { useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { LearningHeader } from './LearningHeader';
import { LearningDrawer, LearningSidebar } from './LearningNav';
import { FilmonsLearningTransition } from './FilmonsLearningTransition';

const ENTERED_KEY = 'filmons_learning_entered';
const ORIGIN_KEY = 'filmons_learning_origin';

// Course Detail gets an immersive layout on mobile -- this bundle's own
// header is hidden, leaving just the course's local sticky header +
// Enroll/Continue CTA (desktop keeps the sidebar). Matches exactly
// `course/:courseId` (useLocation().pathname is basename-relative), not
// its `/content` or `/lesson/:lessonId` children.
const COURSE_DETAIL_PATH = /^\/course\/[^/]+\/?$/;
// A lesson is focus mode on every screen size: no header, drawer or
// sidebar -- the player's own back + Lessons controls only.
const LESSON_PATH = /^\/course\/[^/]+\/lesson\//;

export function LearningLayout() {
  const location = useLocation();
  const inLesson = LESSON_PATH.test(location.pathname);
  const hideHeader = inLesson || COURSE_DETAIL_PATH.test(location.pathname);
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const [showStartup, setShowStartup] = useState(() => {
    try { return !sessionStorage.getItem(ENTERED_KEY) && !sessionStorage.getItem(ORIGIN_KEY); } catch { return false; }
  });

  useEffect(() => {
    if (!showStartup) return;
    try { sessionStorage.setItem(ENTERED_KEY, '1'); } catch {}
  }, [showStartup]);

  // Any navigation (drawer item, in-page link, back button) closes it.
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  // No bottom navigation bar anywhere in Learning -- the drawer (mobile)
  // and sidebar (desktop) are the navigation.
  return (
    <div className="min-h-screen flex bg-gray-50">
      {!inLesson && <LearningSidebar />}
      <div className="flex-1 min-w-0 flex flex-col">
        {!hideHeader && <LearningHeader onOpenMenu={() => setMenuOpen(true)} />}
        <div className="flex-1">
          <Outlet />
        </div>
      </div>
      {!inLesson && <LearningDrawer open={menuOpen} onClose={closeMenu} />}
      {showStartup && (
        <FilmonsLearningTransition ready mode="enter" onDone={() => setShowStartup(false)} />
      )}
    </div>
  );
}
