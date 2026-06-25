import { Link, useNavigate, useLocation } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { UserAvatar } from './AccountTypeBadge';
import { toast } from 'sonner';
import {
  X, ShoppingBag, Heart, CalendarDays, CreditCard,
  Layers, ShieldCheck, BarChart2, HelpCircle, Mail,
  Settings, Lock, Bell, LogOut, Home, Search, UserPlus,
  ChevronRight, Moon, Sun,
} from 'lucide-react';

type LucideIcon = React.ComponentType<{ className?: string; strokeWidth?: number }>;

interface Props {
  onClose: () => void;
}

function NavRow({ icon: Icon, label, to, active, onClick }: {
  icon: LucideIcon; label: string; to: string; active: boolean; onClick: () => void;
}) {
  return (
    <Link to={to} onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors ${
        active ? 'text-gray-900 bg-gray-50' : 'text-gray-700 hover:bg-gray-50'
      }`}>
      <Icon className={`w-[18px] h-[18px] shrink-0 ${active ? 'text-gray-900' : 'text-gray-400'}`} strokeWidth={active ? 2.25 : 1.75} />
      <span>{label}</span>
    </Link>
  );
}

function SectionRow({ icon: Icon, label, to, action, danger }: {
  icon: LucideIcon; label: string; to?: string; action?: () => void; danger?: boolean;
}) {
  const navigate = useNavigate();
  const cls = `w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-gray-50 active:bg-gray-100 ${
    danger ? 'text-red-500' : 'text-gray-700'
  }`;
  const content = (
    <>
      <Icon className={`w-[18px] h-[18px] shrink-0 ${danger ? 'text-red-400' : 'text-gray-400'}`} strokeWidth={1.75} />
      <span className="text-sm font-medium flex-1">{label}</span>
    </>
  );
  if (action) return <button onClick={action} className={cls}>{content}</button>;
  return <button onClick={() => navigate(to!)} className={cls}>{content}</button>;
}

export function SideDrawer({ onClose }: Props) {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate   = useNavigate();
  const location   = useLocation();

  const isActive = (to: string) =>
    to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);

  const go = (to: string) => { onClose(); navigate(to); };

  const handleLogout = async () => {
    localStorage.removeItem('filmons_current_user');
    await logout();
    onClose();
    navigate('/login');
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[70] bg-black/50"
        style={{ backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className="fixed left-0 top-0 bottom-0 z-[71] bg-white flex flex-col shadow-2xl"
        style={{
          width: 'min(300px, 85vw)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          animation: 'drawerSlideIn 0.28s cubic-bezier(0.32,0.72,0,1)',
        }}
      >
        <style>{`
          @keyframes drawerSlideIn {
            from { transform: translateX(-100%); }
            to   { transform: translateX(0); }
          }
        `}</style>

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-4 pt-12 pb-4 border-b border-gray-100">
          {user ? (
            <button
              onClick={() => go('/profile')}
              className="flex items-center gap-3 flex-1 min-w-0 text-left group"
            >
              <UserAvatar user={user} size={38} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-gray-900 truncate leading-tight">{user.name}</p>
                <p className="text-[11px] text-gray-400 truncate">@{user.username || user.email?.split('@')[0]}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 shrink-0 group-hover:text-gray-400" strokeWidth={1.75} />
            </button>
          ) : (
            <Link
              to="/login"
              onClick={onClose}
              className="flex items-center gap-3 flex-1 min-w-0 px-3 py-2.5 bg-gray-900 rounded-xl group"
            >
              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                <UserPlus className="w-4 h-4 text-white" strokeWidth={1.75} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white truncate leading-tight">Sign In / Create Account</p>
                <p className="text-[10px] text-white/60 truncate">Join the community</p>
              </div>
              <ChevronRight className="w-4 h-4 text-white/40 shrink-0 group-hover:text-white/70" strokeWidth={1.75} />
            </Link>
          )}
          <button
            onClick={onClose}
            className="ml-3 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto">

          {/* LOGGED OUT: simple nav */}
          {!user && (
            <div className="py-2">
              <NavRow icon={Home}       label="Home"        to="/"            active={isActive('/')}            onClick={onClose} />
              <NavRow icon={ShoppingBag} label="Marketplace" to="/marketplace" active={isActive('/marketplace')} onClick={onClose} />
              <NavRow icon={Search}     label="Search"      to="/search"      active={isActive('/search')}      onClick={onClose} />
            </div>
          )}

          {/* LOGGED IN: full sections */}
          {user && (
            <>
              <div className="mb-1">
                <p className="px-4 pt-4 pb-1.5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Marketplace</p>
                <SectionRow icon={ShoppingBag}  label="My Listings"          to="/my-listings"           />
                <SectionRow icon={Heart}         label="Saved Listings"        to="/profile?tab=saved"     />
                <SectionRow icon={CalendarDays}  label="Bookings & Requests"  to="/my-orders"             />
                <SectionRow icon={CreditCard}    label="Payments & Earnings"  to="/wallet"                />
              </div>

              <div className="mb-1">
                <p className="px-4 pt-3 pb-1.5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Professional</p>
                <SectionRow icon={Layers}      label="Portfolio"    to="/profile?tab=portfolio" />
                <SectionRow icon={ShieldCheck} label="Verification" to="/verification"          />
                <SectionRow icon={BarChart2}   label="Analytics"    to="/dashboard"             />
              </div>

              <div className="mb-1">
                <p className="px-4 pt-3 pb-1.5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Support</p>
                <SectionRow icon={HelpCircle} label="Help Center"      to="/help"    />
                <SectionRow icon={Mail}       label="Contact Support"  to="/contact" />
              </div>

              <div className="mb-1">
                <p className="px-4 pt-3 pb-1.5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Settings</p>
                <SectionRow icon={Settings} label="Settings"           to="/settings"               />
                <SectionRow icon={Lock}     label="Privacy & Security" to="/settings/privacy"       />
                <SectionRow icon={Bell}     label="Notifications"      to="/settings/notifications" />
              </div>
            </>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="border-t border-gray-100">
          {/* Theme toggle */}
          <button
            onClick={() => {
              const next = theme === 'dark' ? 'light' : 'dark';
              setTheme(next);
              toast.success(next === 'dark' ? 'Dark mode on' : 'Light mode on');
            }}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            {theme === 'dark'
              ? <Sun  className="w-[18px] h-[18px] shrink-0 text-gray-400" strokeWidth={1.75} />
              : <Moon className="w-[18px] h-[18px] shrink-0 text-gray-400" strokeWidth={1.75} />}
            <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
          </button>

          {/* Logged-out: Login + Sign up row */}
          {!user && (
            <div className="flex gap-2 px-4 pb-4">
              <Link to="/login" onClick={onClose}
                className="flex-1 flex items-center justify-center py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-all">
                Log in
              </Link>
              <Link to="/create-account" onClick={onClose}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-all">
                <UserPlus className="w-4 h-4" />
                Sign up
              </Link>
            </div>
          )}

          {/* Logged-in: Logout */}
          {user && (
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-red-500 hover:bg-red-50 transition-colors"
            >
              <LogOut className="w-[18px] h-[18px] shrink-0 text-red-400" strokeWidth={1.75} />
              <span>Log out</span>
            </button>
          )}

          <div className="px-4 pb-4">
            <p className="text-[10px] text-gray-300 font-semibold">Filmons V1</p>
          </div>
        </div>
      </div>
    </>
  );
}
