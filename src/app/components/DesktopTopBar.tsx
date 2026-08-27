// Desktop (lg: only) top bar — sits above every page's content, to the
// right of DesktopSidebar (which already reserves the left column via
// Root.tsx's `lg:pl-64` on <main>). Holds the search trigger and the
// account avatar/username, which used to live at the bottom of the
// sidebar — moved here per request so the sidebar is nav-only.
import { Link } from 'react-router';
import { Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { UserAvatar } from './AccountTypeBadge';

interface DesktopTopBarProps { onSearchOpen: () => void; }

export function DesktopTopBar({ onSearchOpen }: DesktopTopBarProps) {
  const { user, isAuthenticated } = useAuth();

  return (
    <div className="hidden lg:flex items-center justify-between gap-4 h-14 px-6 border-b border-gray-100 bg-white/95 backdrop-blur-md sticky top-0 z-20">
      <button
        onClick={onSearchOpen}
        className="flex items-center gap-2.5 bg-gray-100 rounded-2xl px-3.5 py-2 text-left hover:bg-gray-200 transition-colors w-full max-w-sm"
      >
        <Search className="w-4 h-4 text-blue-500 shrink-0" />
        <span className="text-sm text-gray-400">Search creators, gear, services…</span>
      </button>

      {isAuthenticated && user && (
        <Link to="/profile" className="flex items-center gap-2.5 shrink-0 text-right hover:opacity-80 transition-opacity">
          <div>
            <p className="text-sm font-bold text-gray-900 leading-tight">{user.name}</p>
            <p className="text-[11px] text-gray-400">@{user.username || user.email?.split('@')[0]}</p>
          </div>
          <UserAvatar user={user} size={32} />
        </Link>
      )}
    </div>
  );
}
