// FILMONS Learning navigation -- one item list rendered two ways: the
// mobile slide-in drawer (LearningDrawer) and the persistent desktop
// sidebar (LearningSidebar). Paths are Learning-router-relative (see
// learningRoutes.tsx's basename note).
import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeft, Bell, BookOpen, Clock, Compass, GraduationCap, Home, LayoutDashboard, TrendingUp, UserRound, X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationsContext';
import { useLearningTransition } from '../../context/LearningTransitionContext';
import { canCreateCourses } from '../../lib/coursesApi';

interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  /** Extra path prefixes that count as this destination being active. */
  alsoActive?: RegExp;
  badge?: 'notifications';
}

const BASE_ITEMS: NavItem[] = [
  { label: 'Home',            path: '/',                icon: Home },
  { label: 'Explore',         path: '/explore',         icon: Compass, alsoActive: /^\/topic\// },
  { label: 'Trending topics', path: '/topics/trending', icon: TrendingUp },
  { label: 'Recent topics',   path: '/topics/recent',   icon: Clock },
  { label: 'My learning',     path: '/my-learning',     icon: BookOpen },
  { label: 'Notifications',   path: '/notifications',   icon: Bell, badge: 'notifications' },
  { label: 'Profile',         path: '/profile',         icon: UserRound },
];
const INSTRUCTOR_ITEM: NavItem = { label: 'Instructor dashboard', path: '/instructor', icon: LayoutDashboard, alsoActive: /^\/create\/?$/ };

function isActive(item: NavItem, pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/';
  return path === item.path || (!!item.alsoActive && item.alsoActive.test(path));
}

export function LearningWordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 min-w-0 ${className}`}>
      <GraduationCap className="w-5 h-5 text-blue-600 shrink-0" />
      <span className="text-sm font-black tracking-wide text-gray-900 truncate">
        FILMONS <span className="text-blue-600">LEARNING</span>
      </span>
    </span>
  );
}

/** The vertical item list, shared by the drawer and the sidebar. */
function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user } = useAuth();
  const { unreadCount } = useNotifications();
  // Professional and Business accounts can create courses -> dashboard.
  const items = canCreateCourses(user?.accountType) ? [...BASE_ITEMS, INSTRUCTOR_ITEM] : BASE_ITEMS;

  return (
    <nav aria-label="Learning" className="flex flex-col gap-0.5">
      {items.map(item => {
        const active = isActive(item, pathname);
        const Icon = item.icon;
        const count = item.badge === 'notifications' && user ? unreadCount : 0;
        return (
          <button
            key={item.path}
            onClick={() => { navigate(item.path); onNavigate?.(); }}
            aria-current={active ? 'page' : undefined}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold transition-colors ${
              active ? 'bg-blue-50 text-blue-600' : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <Icon className={`w-5 h-5 shrink-0 ${active ? 'text-blue-600' : 'text-gray-500'}`} strokeWidth={active ? 2.4 : 2} />
            <span className="flex-1 truncate">{item.label}</span>
            {count > 0 && (
              <span className="min-w-[20px] rounded-full bg-blue-600 px-1.5 py-0.5 text-center text-[10px] font-black text-white">
                {count > 99 ? '99+' : count}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

function BackToFilmons({ onNavigate }: { onNavigate?: () => void }) {
  const { leaveLearning } = useLearningTransition();
  return (
    <button
      onClick={() => { onNavigate?.(); leaveLearning('/'); }}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-gray-700 hover:bg-gray-100 transition-colors"
    >
      <ArrowLeft className="w-5 h-5 shrink-0 text-gray-500" />
      Back to FILMONS
    </button>
  );
}

// Inline (not Tailwind) transitions: theme.css's global `*` rule fixes
// transition-property to a list without transform, and as an unlayered
// rule it beats Tailwind's layered utilities -- see AuthScreenLayout.tsx.
const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

/** Mobile: slides in from the left over a dimmed page. */
export function LearningDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow; };
  }, [open, onClose]);

  return (
    <div className="md:hidden fixed inset-0 z-50" style={{ pointerEvents: open ? 'auto' : 'none' }} aria-hidden={!open}>
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
        style={{ opacity: open ? 1 : 0, transition: `opacity 300ms ${EASE}` }}
      />
      <aside
        role="dialog" aria-modal="true" aria-label="Learning menu"
        className="absolute inset-y-0 left-0 flex w-[80%] max-w-[320px] flex-col bg-white shadow-2xl"
        style={{ transform: open ? 'translateX(0)' : 'translateX(-100%)', visibility: open ? 'visible' : 'hidden', transition: `transform 300ms ${EASE}, visibility 300ms` }}
      >
        <div className="flex items-center gap-3 border-b border-gray-100 px-4" style={{ paddingTop: 'max(14px, env(safe-area-inset-top))', paddingBottom: '12px' }}>
          <LearningWordmark className="flex-1" />
          <button ref={closeRef} onClick={onClose} aria-label="Close menu"
            className="w-9 h-9 -mr-1.5 flex items-center justify-center rounded-full hover:bg-gray-100 shrink-0">
            <X className="w-5 h-5 text-gray-700" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-3">
          <NavList onNavigate={onClose} />
        </div>
        <div className="border-t border-gray-100 px-3 pt-2" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
          <BackToFilmons onNavigate={onClose} />
        </div>
      </aside>
    </div>
  );
}

/** Desktop: persistent left sidebar with the same items. */
export function LearningSidebar() {
  const navigate = useNavigate();
  return (
    <aside className="hidden md:flex sticky top-0 h-screen w-64 shrink-0 flex-col border-r border-gray-100 bg-white">
      <button onClick={() => navigate('/')} className="px-6 pt-6 pb-5 text-left">
        <LearningWordmark />
      </button>
      <div className="flex-1 overflow-y-auto px-3">
        <NavList />
      </div>
      <div className="border-t border-gray-100 px-3 py-3">
        <BackToFilmons />
      </div>
    </aside>
  );
}
