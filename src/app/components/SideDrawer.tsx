import { Link, useNavigate, useLocation } from 'react-router';
import { useAuth } from '../context/AuthContext';
import {
  X, House, Search, MessageCircle, BriefcaseBusiness, FileText,
  LayoutDashboard, Wallet, Bookmark, Settings, CircleHelp, LogOut,
  UserPlus,
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

export function SideDrawer({ onClose }: Props) {
  const { user, logout } = useAuth();
  const navigate   = useNavigate();
  const location   = useLocation();

  const isActive = (to: string) =>
    to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);

  const handleLogout = async () => {
    localStorage.removeItem('filmons_current_user');
    await logout();
    onClose();
    navigate('/login');
  };

  return (
    <>
      {/* Backdrop -- tapping it closes the drawer */}
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
          <span className="text-lg font-black text-gray-900 tracking-tight">FILMONS</span>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto">

          {/* LOGGED OUT: simple nav — the drawer's logged-in items below all
              require an account (Messages, Opportunities, Applications,
              Dashboard, Wallet, Saved), so a guest only gets Home/Browse
              plus Contact Support (which itself never requires signing in
              -- see ContactSupport.tsx's GuestSupportForm); Sign In lives
              in the footer below. */}
          {!user && (
            <div className="py-2">
              <NavRow icon={House}      label="Home"             to="/"        active={isActive('/')}        onClick={onClose} />
              <NavRow icon={Search}     label="Browse"           to="/search"  active={isActive('/search')}  onClick={onClose} />
              <NavRow icon={CircleHelp} label="Contact Support"  to="/support" active={isActive('/support')} onClick={onClose} />
            </div>
          )}

          {/* LOGGED IN: flat list, exact required order */}
          {user && (
            <div className="py-2">
              <NavRow icon={House}             label="Home"          to="/"                          active={isActive('/')}                onClick={onClose} />
              <NavRow icon={Search}            label="Browse"        to="/search"                    active={isActive('/search')}          onClick={onClose} />
              <NavRow icon={MessageCircle}     label="Messages"      to="/inbox"                      active={isActive('/inbox')}           onClick={onClose} />
              <NavRow icon={BriefcaseBusiness} label="Opportunities" to="/dashboard?tab=opportunities" active={location.pathname === '/dashboard' && location.search.includes('tab=opportunities')} onClick={onClose} />
              <NavRow icon={FileText}          label="Applications"  to="/dashboard?tab=applications"  active={location.pathname === '/dashboard' && location.search.includes('tab=applications')}  onClick={onClose} />
              <NavRow icon={LayoutDashboard}   label="Dashboard"     to="/dashboard"                  active={isActive('/dashboard')}       onClick={onClose} />
              <NavRow icon={Wallet}            label="Wallet"        to="/wallet"                     active={isActive('/wallet')}          onClick={onClose} />
              <NavRow icon={Bookmark}          label="Saved"         to="/profile?tab=saved"          active={location.pathname === '/profile' && location.search.includes('tab=saved')} onClick={onClose} />

              <div className="my-2 border-t border-gray-100" />

              <NavRow icon={Settings}    label="Settings"         to="/settings" active={isActive('/settings')} onClick={onClose} />
              <NavRow icon={CircleHelp}  label="Contact Support"  to="/support"  active={isActive('/support')}  onClick={onClose} />

              <div className="my-2 border-t border-gray-100" />

              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-red-500 hover:bg-red-50 transition-colors text-left"
              >
                <LogOut className="w-[18px] h-[18px] shrink-0 text-red-400" strokeWidth={1.75} />
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>

        {/* ── Footer — logged-out only ── */}
        {!user && (
          <div className="border-t border-gray-100 flex gap-2 px-4 py-4">
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
      </div>
    </>
  );
}
