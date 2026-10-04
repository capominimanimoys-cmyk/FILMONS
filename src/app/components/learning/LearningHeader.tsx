// Filmons Learning's own product header -- this bundle has no normal
// Filmons TopBar/DesktopTopBar at all (it's a separate Rollup entry, see
// learning.html/learningRoutes.tsx). Navigation lives in LearningNav:
// on mobile the hamburger here opens the slide-in drawer; on desktop the
// persistent sidebar carries it and this bar only holds search + account.
// Search is a real Filmons-side page outside this bundle, so it crosses
// back out via leaveLearning() rather than this bundle's own router.
import { useLocation, useNavigate } from 'react-router';
import { Menu, Search } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLearningTransition } from '../../context/LearningTransitionContext';
import { learningLoginPath } from '../../lib/learningAuth';
import { useLearningSession } from '../../context/LearningSessionContext';
import { UserAvatar } from '../AccountTypeBadge';
import { LearningWordmark } from './LearningNav';

export function LearningHeader({ onOpenMenu }: { onOpenMenu: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { leaveLearning } = useLearningTransition();
  const { endLearningSession } = useLearningSession();
  // Learning has its own sign-in (see LearningSessionContext): logging in
  // here goes through Learning's login page, logging out ends only the
  // Learning session -- FILMONS itself stays signed in.
  const logIn = () => navigate(learningLoginPath(location.pathname + location.search));
  const logOut = () => { endLearningSession(); navigate('/', { replace: true }); };
  const search = () => leaveLearning('/search?tab=learning');

  return (
    <div className="sticky top-0 z-20 bg-white border-b border-gray-100">
      {/* Mobile */}
      <div className="md:hidden flex items-center gap-2 px-3" style={{ paddingTop: 'max(10px, env(safe-area-inset-top))', paddingBottom: '10px' }}>
        <button onClick={onOpenMenu} aria-label="Open menu" className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 shrink-0">
          <Menu className="w-5 h-5 text-gray-800" />
        </button>
        <button onClick={() => navigate('/')} className="min-w-0 flex-1 text-left">
          <LearningWordmark />
        </button>
        <button onClick={search} aria-label="Search Learning" className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 shrink-0">
          <Search className="w-[18px] h-[18px] text-gray-700" />
        </button>
        {user ? (
          <button onClick={() => navigate('/profile')} aria-label="Your Learning profile" className="shrink-0 rounded-full">
            <UserAvatar user={{ id: user.id, name: user.name, avatar: user.avatar }} size={30} />
          </button>
        ) : (
          <button onClick={logIn} className="shrink-0 rounded-full bg-blue-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-blue-700">Log in</button>
        )}
      </div>

      {/* Desktop -- navigation is in the sidebar */}
      <div className="hidden md:flex items-center justify-end gap-3 px-8 xl:px-10 py-3">
        <button onClick={search} className="flex items-center gap-2 rounded-full bg-gray-100 px-4 py-2 text-xs font-semibold text-gray-500 hover:bg-gray-200 transition-colors">
          <Search className="w-4 h-4" /> Search Learning
        </button>
        {user ? (
          <button onClick={logOut} className="text-xs font-bold text-gray-500 hover:text-gray-800">Log out</button>
        ) : (
          <button onClick={logIn} className="rounded-full bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700">Log in</button>
        )}
      </div>
    </div>
  );
}
