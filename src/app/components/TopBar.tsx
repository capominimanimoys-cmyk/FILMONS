import { Link } from 'react-router';
import { Menu, Bell, Search } from 'lucide-react';
import { FilmonsLogo } from './FilmonsLogo';
import { useAuth } from '../context/AuthContext';
import { useEffect, useState } from 'react';
import * as notifStore from '../lib/notifications';

interface TopBarProps { onMenuClick: () => void; onSearchOpen: () => void; }

export function TopBar({ onMenuClick, onSearchOpen }: TopBarProps) {
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!user) return;
    const update = () => setUnread(notifStore.getUnreadCount(user.id));
    update();
    const t = setInterval(update, 15_000);
    return () => clearInterval(t);
  }, [user?.id]);

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-gray-100">
      <div className="flex items-center gap-3 px-4 h-14">
        {/* Burger */}
        <button onClick={onMenuClick}
          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 transition-colors -ml-1">
          <Menu className="w-5 h-5 text-gray-700" />
        </button>

        {/* Logo */}
        <Link to="/" className="flex items-center flex-1">
          <FilmonsLogo iconSize={26} theme="light"/>
        </Link>

        {/* Right actions */}
        <div className="flex items-center gap-1">
          {/* Search — opens AI search overlay */}
          <button onClick={onSearchOpen}
            className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 transition-colors text-gray-600 active:scale-90">
            <Search className="w-5 h-5" />
          </button>

          {/* Notifications */}
          <Link to={user ? '/notifications' : '/login'}
            className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 transition-colors text-gray-600 relative">
            <Bell className="w-5 h-5" />
            {unread > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
            )}
          </Link>

          {/* Avatar */}
          <Link to={user ? '/profile' : '/login'}
            className="w-8 h-8 rounded-full overflow-hidden bg-gray-100 flex items-center justify-center ml-1 border border-gray-200">
            {user?.avatar
              ? <img src={user.avatar} alt="" className="w-full h-full object-cover" />
              : <span className="text-xs font-bold text-gray-500">{user?.name?.[0]?.toUpperCase() || '?'}</span>
            }
          </Link>
        </div>
      </div>
    </header>
  );
}
