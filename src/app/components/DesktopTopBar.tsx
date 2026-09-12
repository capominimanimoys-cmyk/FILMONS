// Desktop (lg: only) top bar — sits above every page's content, to the
// right of DesktopSidebar (which already reserves the left column via
// Root.tsx's `lg:pl-64` on <main>). Holds the search trigger, notifications,
// and the account avatar (name/username dropped per request — avatar only),
// which used to live at the bottom of the sidebar — moved here so the
// sidebar is nav-only.
//
// On /search/category/* specifically, Root.tsx removes DesktopSidebar
// entirely (that page wants the full desktop width) -- which would
// otherwise also remove the FILMONS logo and every nav link the sidebar
// normally carries, with nothing replacing them. This bar expands into a
// full horizontal marketplace nav (logo + Marketplace/Creators/Studios/
// Opportunities + search + notifications + messages + avatar) ONLY on
// that route, so the page never loses its way back to the rest of the
// app. Everywhere else this renders exactly as before.
import { Link, useLocation } from 'react-router';
import { Search, Bell, MessageCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { FilmonsLogo } from './FilmonsLogo';
import { UserAvatar } from './AccountTypeBadge';
import * as notifStore from '../lib/notifications';
import { chatApi } from '../lib/api';

interface DesktopTopBarProps { onSearchOpen: () => void; }

const CATEGORY_NAV_LINKS = [
  { label: 'Marketplace',   to: '/search' },
  { label: 'Creators',      to: '/search/category/creators' },
  { label: 'Studios',       to: '/search/category/studios' },
  { label: 'Opportunities', to: '/search/category/opportunities' },
];

export function DesktopTopBar({ onSearchOpen }: DesktopTopBarProps) {
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();
  const isCategoryPage = location.pathname.startsWith('/search/category/');
  const [unread, setUnread] = useState(0);
  const [unreadMsgs, setUnreadMsgs] = useState(0);

  useEffect(() => {
    if (!user) return;
    const update = () => setUnread(notifStore.getUnreadCount(user.id));
    update();
    const t = setInterval(update, 15_000);
    return () => clearInterval(t);
  }, [user?.id]);

  useEffect(() => {
    if (!isCategoryPage || !user) { setUnreadMsgs(0); return; }
    const update = () => setUnreadMsgs(chatApi.getUnreadCount(user.id));
    update();
    const t = setInterval(update, 15_000);
    window.addEventListener('filmons:unread-changed', update);
    return () => { clearInterval(t); window.removeEventListener('filmons:unread-changed', update); };
  }, [isCategoryPage, user?.id]);

  if (isCategoryPage) {
    return (
      <div className="hidden lg:flex items-center gap-6 h-14 px-8 border-b border-gray-100 bg-white/95 backdrop-blur-md sticky top-0 z-40">
        <Link to="/" className="shrink-0"><FilmonsLogo iconSize={20} theme="light" /></Link>
        <nav className="flex items-center gap-5 shrink-0">
          {CATEGORY_NAV_LINKS.map(l => (
            <Link key={l.to} to={l.to} className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">
              {l.label}
            </Link>
          ))}
        </nav>
        <button
          onClick={onSearchOpen}
          className="flex items-center gap-2.5 bg-gray-100 rounded-2xl px-3.5 py-2 text-left hover:bg-gray-200 transition-colors flex-1 max-w-sm"
        >
          <Search className="w-4 h-4 text-blue-500 shrink-0" />
          <span className="text-sm text-gray-400">Search…</span>
        </button>
        {isAuthenticated && user && (
          <div className="flex items-center gap-3 shrink-0 ml-auto">
            <Link to="/inbox" className="relative w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-600">
              <MessageCircle className="w-5 h-5" />
              {unreadMsgs > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />}
            </Link>
            <Link to="/notifications" className="relative w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-600">
              <Bell className="w-5 h-5" />
              {unread > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />}
            </Link>
            <Link to="/profile" className="hover:opacity-80 transition-opacity">
              <UserAvatar user={user} size={32} />
            </Link>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="hidden lg:flex items-center justify-between gap-4 h-14 px-6 border-b border-gray-100 bg-white/95 backdrop-blur-md sticky top-0 z-40">
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
