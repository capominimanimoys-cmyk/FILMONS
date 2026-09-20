// Shell for every /learning/* route (see routes.tsx) -- renders the
// product header once instead of duplicating it per page, and shows a
// short branded startup splash the FIRST time this session lands inside
// Learning without having come through the normal enterLearning()
// transition (e.g. a direct URL visit or a page refresh while already
// inside /learning/*), per spec section 12. Internal Learning-to-Learning
// navigation (Course -> Lesson, Discover -> Course, etc.) never replays
// this -- the flag is set for the rest of the browser session once shown.
import { useEffect, useState } from 'react';
import { Outlet } from 'react-router';
import { LearningHeader } from './LearningHeader';
import { FilmonsLearningTransition } from './FilmonsLearningTransition';

const ENTERED_KEY = 'filmons_learning_entered';

export function LearningLayout() {
  const [showStartup, setShowStartup] = useState(() => {
    try { return !sessionStorage.getItem(ENTERED_KEY); } catch { return false; }
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
