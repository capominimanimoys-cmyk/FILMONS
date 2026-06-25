import { Link, useNavigate, useLocation } from 'react-router';
import { FilmonsLogo } from './FilmonsLogo';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import {
  Home, LayoutGrid, Search, MessageCircle, Bell,
  User, Settings, LogOut, X, Moon, Sun, UserPlus,
  ChevronRight,
} from 'lucide-react';
import { UserAvatar } from './AccountTypeBadge';
import { chatApi } from '../lib/api';
import * as notifStore from '../lib/notifications';
import { useState, useEffect, useRef } from 'react';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

type LucideIcon = React.ComponentType<{ className?: string; strokeWidth?: number }>;

function NavRow({
  icon: Icon, label, to, active, badge, badgeColor, onClick,
}: { icon: LucideIcon; label: string; to: string; active: boolean; badge?: number; badgeColor?: string; onClick: () => void }) {
  return (
    <Link to={to} onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all
        ${active ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}>
      <div className="relative flex-shrink-0">
        <Icon className="w-[18px] h-[18px]" strokeWidth={active ? 2.25 : 1.75} />
        {badge != null && badge > 0 && (
          <span className={`absolute -top-1.5 -right-1.5 min-w-[15px] h-[15px] ${badgeColor} text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5`}>
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </div>
      <span className="flex-1">{label}</span>
      {badge != null && badge > 0 && (
        <span className={`text-xs font-semibold tabular-nums ${active ? 'text-white/70' : 'text-gray-400'}`}>{badge}</span>
      )}
    </Link>
  );
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const { user, logout } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();
  const { theme, setTheme } = useTheme();
  const [unreadMsgs,   setUnreadMsgs]   = useState(0);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Unread badge counts — only when authenticated
  useEffect(() => {
    if (!user) { setUnreadMsgs(0); setUnreadNotifs(0); return; }
    const tick = () => {
      setUnreadNotifs(notifStore.getUnreadCount(user.id));
      setUnreadMsgs(chatApi.getUnreadCount(user.id));
    };
    tick();
    const li = setInterval(tick, 15_000);
    window.addEventListener('filmons:unread-changed', tick);
    const serverTick = async () => {
      try { setUnreadMsgs(await chatApi.getServerUnreadCount(user.id)); } catch {}
    };
    serverTick();
    const si = setInterval(serverTick, 45_000);
    return () => { clearInterval(li); clearInterval(si); window.removeEventListener('filmons:unread-changed', tick); };
  }, [user?.id]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [open, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const isActive = (to: string) =>
    to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);

  const handleLogout = async () => {
    // Belt-and-suspenders: wipe storage before React state update
    localStorage.removeItem('filmons_current_user');
    await logout();
    onClose();
    navigate('/login');
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity duration-300 ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={sidebarRef}
        className="fixed top-0 left-0 h-full z-50 bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-out"
        style={{ width: 280, transform: open ? 'translateX(0)' : 'translateX(-100%)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-14 border-b border-gray-100 flex-shrink-0">
          <Link to="/" onClick={onClose}><FilmonsLogo iconSize={26} theme="light"/></Link>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-5 h-5 text-gray-500" strokeWidth={1.75}/>
          </button>
        </div>

        {/* ── LOGGED IN ─────────────────────────────────────────────────── */}
        {user ? (
          <>
            {/* User card */}
            <div className="px-3 pt-3 pb-2 border-b border-gray-100 flex-shrink-0">
              <Link to="/profile" onClick={onClose}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-all group">
                <UserAvatar user={user} size={36} className="flex-shrink-0"/>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900 truncate">{user.name}</p>
                  <p className="text-xs text-gray-400 truncate">
                    {user.username ? `@${user.username}` : user.email}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0 group-hover:text-gray-400 transition-colors" strokeWidth={1.75}/>
              </Link>
            </div>

            {/* Auth nav */}
            <nav className="flex-1 overflow-y-auto py-2 px-3 space-y-0.5">
              <NavRow icon={User}          label="Profile"       to="/profile"       active={isActive('/profile')}       onClick={onClose}/>
              <NavRow icon={MessageCircle} label="Inbox"         to="/inbox"         active={isActive('/inbox')}         onClick={onClose} badge={unreadMsgs}   badgeColor="bg-blue-600"/>
              <NavRow icon={Bell}          label="Notifications" to="/notifications" active={isActive('/notifications')} onClick={onClose} badge={unreadNotifs} badgeColor="bg-red-500"/>
              <NavRow icon={Settings}      label="Settings"      to="/settings"      active={isActive('/settings')}      onClick={onClose}/>
            </nav>

            {/* Bottom: theme + logout */}
            <div className="flex-shrink-0 border-t border-gray-100 px-3 py-3 flex items-center gap-1">
              <button
                onClick={() => {
                  const next = theme === 'dark' ? 'light' : 'dark';
                  setTheme(next);
                  toast.success(next === 'dark' ? 'Dark mode on' : 'Light mode on');
                }}
                className="flex-1 flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-all">
                {theme === 'dark'
                  ? <Sun  className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={1.75}/>
                  : <Moon className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={1.75}/>}
                <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
              </button>
              <button onClick={handleLogout}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 transition-all">
                <LogOut className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={1.75}/>
                <span>Log out</span>
              </button>
            </div>
          </>
        ) : (
          /* ── LOGGED OUT ─────────────────────────────────────────────── */
          <>
            {/* Sign in card — mirrors user card position */}
            <div className="px-3 pt-3 pb-2 border-b border-gray-100 flex-shrink-0">
              <Link to="/login" onClick={onClose}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-900 hover:bg-gray-800 transition-all group">
                <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                  <UserPlus className="w-4 h-4 text-white" strokeWidth={1.75}/>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white">Sign In / Create Account</p>
                  <p className="text-xs text-white/60">Join the community</p>
                </div>
                <ChevronRight className="w-4 h-4 text-white/40 flex-shrink-0 group-hover:text-white/70 transition-colors" strokeWidth={1.75}/>
              </Link>
            </div>

            <nav className="flex-1 overflow-y-auto py-2 px-3 space-y-0.5">
              <NavRow icon={Home}       label="Home"        to="/"            active={isActive('/')}            onClick={onClose}/>
              <NavRow icon={LayoutGrid} label="Marketplace" to="/marketplace" active={isActive('/marketplace')} onClick={onClose}/>
              <NavRow icon={Search}     label="Search"      to="/search"      active={isActive('/search')}      onClick={onClose}/>
            </nav>

            <div className="flex-shrink-0 border-t border-gray-100 px-3 py-4 flex gap-2">
              <Link to="/login" onClick={onClose}
                className="flex-1 flex items-center justify-center py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-all">
                Log in
              </Link>
              <Link to="/create-account" onClick={onClose}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-all">
                <UserPlus className="w-4 h-4"/>
                Sign up
              </Link>
            </div>
          </>
        )}
      </div>
    </>
  );
}
