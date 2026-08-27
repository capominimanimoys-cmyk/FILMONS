// Desktop (lg: only) top bar — sits above every page's content, to the
// right of DesktopSidebar (which already reserves the left column via
// Root.tsx's `lg:pl-64` on <main>). Holds the search trigger, notifications,
// and the account avatar (name/username dropped per request — avatar only),
// which used to live at the bottom of the sidebar — moved here so the
// sidebar is nav-only.
import { Link } from 'react-router';
import { Search, Bell } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { UserAvatar } from './AccountTypeBadge';
import * as notifStore from '../lib/notifications';

interface DesktopTopBarProps { onSearchOpen: () => void; }

export function DesktopTopBar({ onSearchOpen }: DesktopTopBarProps) {
  const { user, isAuthenticated } = useAuth();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!user) return;
    const update = () => setUnread(notifStore.getUnreadCount(user.id));
    update();
    const t = setInterval(update, 15_000);
    return () => clearInterval(t);
  }, [user?.id]);

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
        <div className="flex items-center gap-3 shrink-0">
          <Link to="/notifications" className="relative w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-600">
            <Bell className="w-5 h-5" />
            {unread > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
            )}
          </Link>
          <Link to="/profile" className="hover:opacity-80 transition-opacity">
            <UserAvatar user={user} size={32} />
          </Link>
        </div>
      )}
    </div>
  );
}
