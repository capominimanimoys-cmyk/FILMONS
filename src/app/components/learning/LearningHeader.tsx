// Filmons Learning's own product header -- deliberately NOT the normal
// Filmons TopBar/DesktopTopBar (Root.tsx hides those for every /learning/*
// route). Keeps the visual relationship to Filmons obvious (the lockup,
// shared type/color language) while making "I am inside Filmons Learning"
// unmistakable, per the Learning Product Entry spec.
import { useLocation, useNavigate } from 'react-router';
import { ArrowLeft, Search, GraduationCap } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { isProfessional } from '../../lib/reliabilityApi';
import { useLearningTransition } from '../../context/LearningTransitionContext';

export function LearningHeader() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { leaveLearning } = useLearningTransition();
  const canTeach = isProfessional(user?.accountType);

  const navItems = [
    { label: 'Discover', path: '/learning' },
    { label: 'My Learning', path: '/learning/my-learning' },
    ...(canTeach ? [{ label: 'Teach', path: '/learning/create' }] : []),
  ];

  return (
    <div className="sticky top-0 z-20 bg-white border-b border-gray-100">
      {/* Mobile */}
      <div className="md:hidden flex items-center gap-3 px-4" style={{ paddingTop: 'max(14px, env(safe-area-inset-top))', paddingBottom: '12px' }}>
        <button onClick={leaveLearning} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 -ml-1 shrink-0" aria-label="Back to Filmons">
          <ArrowLeft className="w-4 h-4 text-gray-700" />
        </button>
        <p className="text-sm font-black tracking-wide text-gray-900 truncate">
          FILMONS <span className="text-blue-600">LEARNING</span>
        </p>
        <button onClick={() => navigate('/search?tab=learning')} className="ml-auto w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 shrink-0" aria-label="Search Learning">
          <Search className="w-4 h-4 text-gray-700" />
        </button>
      </div>

      {/* Desktop */}
      <div className="hidden md:flex items-center gap-8 px-8 xl:px-10 py-3">
        <button onClick={leaveLearning} className="flex items-center gap-2 shrink-0" title="Back to Filmons">
          <GraduationCap className="w-5 h-5 text-blue-600" />
          <span className="text-sm font-black tracking-wide text-gray-900">FILMONS <span className="text-gray-300 mx-0.5">|</span> <span className="text-blue-600">LEARNING</span></span>
        </button>

        <nav className="flex items-center gap-6">
          {navItems.map(item => {
            const active = location.pathname === item.path;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`text-sm font-bold transition-colors ${active ? 'text-gray-900' : 'text-gray-400 hover:text-gray-700'}`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <button onClick={() => navigate('/search?tab=learning')} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100" aria-label="Search Learning">
            <Search className="w-4 h-4 text-gray-700" />
          </button>
          <button onClick={() => navigate('/profile')} className="text-xs font-bold text-gray-500 hover:text-gray-800">Profile</button>
        </div>
      </div>
    </div>
  );
}
