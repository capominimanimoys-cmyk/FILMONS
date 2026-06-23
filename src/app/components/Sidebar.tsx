/**
 * Sidebar.tsx
 * - Desktop: hidden by default, slides in from left when menuOpen=true
 * - Mobile: sidebar hidden entirely; bottom tab bar handles navigation
 * Icons match Settings page (lucide-react).
 */
import { Link, useNavigate, useLocation } from 'react-router';
import { FilmonsLogo } from './FilmonsLogo';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import {
  Home, LayoutGrid, Rss, Video, MessageCircle, Bell,
  User, ShoppingBag, Bookmark, Calendar, CreditCard,
  Layers, Shield, BarChart2, HelpCircle, Mail,
  Settings, Lock, Eye, LogOut, X, Moon, Sun,
  ChevronRight,
} from 'lucide-react';
import { UserAvatar } from './AccountTypeBadge';
import { FPBadge } from './FPBadge';
import { chatApi } from '../lib/api';
import * as notifStore from '../lib/notifications';
import { useState, useEffect, useRef } from 'react';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

// ── Nav item types ────────────────────────────────────────────────────────────
type LucideIcon = React.ComponentType<{ className?: string; strokeWidth?: number }>;

interface NavItemDef {
  icon: LucideIcon;
  label: string;
  to: string;
  badge?: number;
  badgeColor?: string;
}

interface NavSectionDef {
  label?: string;
  items: NavItemDef[];
}

// ── Sub-components ────────────────────────────────────────────────────────────
function SectionDivider({ label }: { label: string }) {
  return (
    <p className="px-3 pt-5 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400 select-none">
      {label}
    </p>
  );
}

function NavRow({
  icon: Icon, label, to, active, badge, badgeColor, onClick,
}: NavItemDef & { active: boolean; onClick: () => void }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all
        ${active ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}
    >
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

// ── Main component ────────────────────────────────────────────────────────────
export function Sidebar({ open, onClose }: SidebarProps) {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, setTheme } = useTheme();
  const [unreadCount, setUnreadCount]   = useState(0);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const sidebarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) { setUnreadCount(0); setUnreadNotifs(0); return; }
    const localUpdate = () => {
      setUnreadNotifs(notifStore.getUnreadCount(user.id));
      setUnreadCount(chatApi.getUnreadCount(user.id));
    };
    localUpdate();
    const li = setInterval(localUpdate, 15_000);
    // Instant update when a conversation is marked read
    window.addEventListener('filmons:unread-changed', localUpdate);
    const serverUpdate = async () => {
      try { setUnreadCount(await chatApi.getServerUnreadCount(user.id)); } catch {}
    };
    serverUpdate();
    const si = setInterval(serverUpdate, 45_000);
    return () => { clearInterval(li); clearInterval(si); window.removeEventListener('filmons:unread-changed', localUpdate); };
  }, [user?.id]);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const handle = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [open, onClose]);

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const handleLogout = () => { logout(); navigate('/'); onClose(); };

  const isActive = (to: string) => {
    if (to === '/') return location.pathname === '/';
    return location.pathname === to || location.pathname.startsWith(to + '/');
  };

  const isCreatorPlus = user?.accountType === 'business' || user?.accountMode === 'business';
  const isAdmin       = user?.email?.includes('admin') || (user?.accountType as string) === 'admin';

  const coreSections: NavSectionDef[] = [
    {
      items: [
        { icon: Home,          label: 'Home',          to: '/' },
        { icon: LayoutGrid,    label: 'Marketplace',   to: '/marketplace' },
        { icon: Rss,           label: 'Feed',          to: '/feed' },
        { icon: Video,         label: 'Reels',         to: '/reels/latest' },
        ...(isAuthenticated ? [
          { icon: MessageCircle, label: 'Messages',      to: '/inbox',         badge: unreadCount,  badgeColor: 'bg-blue-600' },
          { icon: Bell,          label: 'Notifications', to: '/notifications', badge: unreadNotifs, badgeColor: 'bg-red-500'  },
          { icon: User,          label: 'Profile',       to: '/profile' },
        ] : []),
      ],
    },
  ];

  const authSections: NavSectionDef[] = [
    {
      label: 'Marketplace',
      items: [
        { icon: ShoppingBag, label: 'My Listings',         to: '/my-listings' },
        { icon: Bookmark,    label: 'Saved Listings',       to: '/profile?tab=saved' },
        { icon: Calendar,    label: 'Bookings & Requests',  to: '/bookings' },
        { icon: CreditCard,  label: 'Payments & Earnings',  to: '/wallet' },
      ],
    },
    {
      label: 'Professional',
      items: [
        { icon: Layers,   label: 'Portfolio',   to: '/settings/portfolio' },
        { icon: Shield,   label: 'Verification', to: '/verification' },
        { icon: BarChart2, label: 'Analytics',   to: '/dashboard' },
      ],
    },
    ...(isAdmin ? [{
      label: 'Admin',
      items: [{ icon: Shield, label: 'Admin Panel', to: '/admin-verifications' }],
    }] : []),
  ];

  const supportSection: NavSectionDef = {
    label: 'Support',
    items: [
      { icon: HelpCircle, label: 'Help Center',      to: '/settings#help' },
      { icon: Mail,       label: 'Contact Support',  to: '/contact' },
    ],
  };

  const settingsSection: NavSectionDef = {
    label: 'Settings',
    items: [
      { icon: Settings, label: 'Settings',          to: '/settings' },
      { icon: Eye,      label: 'Privacy',           to: '/settings/privacy' },
      { icon: Lock,     label: 'Security',          to: '/settings/security' },
      { icon: Bell,     label: 'Notifications',     to: '/settings/notifications' },
    ],
  };

  const renderSection = (section: NavSectionDef) => (
    <div key={section.label ?? '_core'}>
      {section.label && <SectionDivider label={section.label} />}
      {section.items.map(item => (
        <NavRow
          key={item.to}
          {...item}
          active={isActive(item.to)}
          onClick={onClose}
        />
      ))}
    </div>
  );

  return (
    <>
      {/* Backdrop — mobile */}
      <div
        className={`fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity duration-300 md:hidden ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      {/* Backdrop — desktop */}
      <div
        className={`fixed inset-0 z-40 bg-black/20 transition-opacity duration-300 hidden md:block ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={sidebarRef}
        className="fixed top-0 left-0 h-full z-50 bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-out"
        style={{ width: '280px', transform: open ? 'translateX(0)' : 'translateX(-100%)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-14 border-b border-gray-100 flex-shrink-0">
          <Link to="/" onClick={onClose}>
            <FilmonsLogo iconSize={26} theme="light" />
          </Link>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-full transition-colors" aria-label="Close menu">
            <X className="w-5 h-5 text-gray-500" strokeWidth={1.75} />
          </button>
        </div>

        {/* User card */}
        {isAuthenticated && user && (
          <div className="px-3 pt-3 pb-2 border-b border-gray-100 flex-shrink-0">
            {isCreatorPlus && (
              <div className="px-3 pb-2"><FPBadge userId={user.id} compact /></div>
            )}
            <Link to="/profile" onClick={onClose}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-all group">
              <UserAvatar user={user} size={36} className="flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 truncate">{user.name}</p>
                <p className="text-xs text-gray-400 truncate">{user.email}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0 group-hover:text-gray-400 transition-colors" strokeWidth={1.75} />
            </Link>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2 px-3 space-y-0.5">
          {coreSections.map(renderSection)}
          {isAuthenticated && authSections.map(renderSection)}
          {renderSection(supportSection)}
          {isAuthenticated && renderSection(settingsSection)}
        </nav>

        {/* Bottom bar */}
        <div className="flex-shrink-0 border-t border-gray-100 px-3 py-3">
          {isAuthenticated ? (
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  const next = theme === 'dark' ? 'light' : 'dark';
                  setTheme(next);
                  toast.success(next === 'dark' ? 'Dark mode on' : 'Light mode on');
                }}
                className="flex-1 flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-all"
              >
                {theme === 'dark'
                  ? <Sun  className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={1.75} />
                  : <Moon className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={1.75} />
                }
                <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
              </button>

              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 transition-all"
              >
                <LogOut className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={1.75} />
                <span>Logout</span>
              </button>
            </div>
          ) : (
            <Link to="/login" onClick={onClose}
              className="flex items-center justify-center gap-2 px-3 py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-all">
              Sign In
            </Link>
          )}
        </div>
      </div>
    </>
  );
}
