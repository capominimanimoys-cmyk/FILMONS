// Desktop (>=768px) left navigation — replaces TopBar/MobileBottomNav's role
// on wider screens. Renders full-width with labels from `lg:` (1024px) up,
// and a collapsed icon-only rail between `md:` and `lg:` (768-1023px), per
// the 4-tier breakdown (mobile bottom nav / tablet rail / desktop sidebar /
// large-desktop sidebar) from the approved redesign plan. Hidden below
// `md:` entirely — MobileBottomNav keeps serving that tier unchanged.
import { Link, useLocation, useNavigate } from 'react-router';
import { useEffect, useState } from 'react';
import {
  Home, Layers, MessageCircle, Heart, CalendarDays, CreditCard,
  Star, BarChart2, Settings, CircleHelp, Sparkles, UserPlus,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { FilmonsLogo } from './FilmonsLogo';
import { chatApi } from '../lib/api';
import { normalizeTier } from '../lib/reliabilityApi';

// Same next-tier copy as Settings.tsx's upgrade banner -- kept in sync
// there since both surfaces show the same upsell for the same tier.
const NEXT_TIER_LABEL: Record<string, string> = {
  creator: 'Upgrade to Creator+', creator_plus: 'Upgrade to Professional',
  professional: 'Upgrade to Business', business: '',
};
const NEXT_TIER_SUB: Record<string, string> = {
  creator: 'Free with ID verification', creator_plus: '$9.99/month · 5 Opportunities/wk',
  professional: '$19.99/month · unlimited Opportunities', business: '',
};

type LucideIcon = React.ComponentType<{ className?: string; strokeWidth?: number }>;

function NavItem({ icon: Icon, label, to, active, badge }: {
  icon: LucideIcon; label: string; to: string; active: boolean; badge?: number;
}) {
  return (
    <Link
      to={to}
      className={`relative flex items-center gap-3 mx-2 px-3 py-2.5 rounded-xl transition-colors lg:justify-start justify-center ${
        active ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
      }`}
      title={label}
    >
      <Icon className="w-5 h-5 shrink-0" strokeWidth={active ? 2.25 : 1.75} />
      <span className="hidden lg:inline text-sm font-semibold truncate">{label}</span>
      {!!badge && badge > 0 && (
        <span className={`absolute lg:static lg:ml-auto -top-1 -right-1 lg:top-auto lg:right-auto min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center ${active ? 'lg:bg-white/20' : ''}`}>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </Link>
  );
}

export function DesktopSidebar() {
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [unreadMsgs, setUnreadMsgs] = useState(0);

  useEffect(() => {
    if (!user) { setUnreadMsgs(0); return; }
    const update = () => setUnreadMsgs(chatApi.getUnreadCount(user.id));
    update();
    const t = setInterval(update, 15_000);
    window.addEventListener('filmons:unread-changed', update);
    return () => { clearInterval(t); window.removeEventListener('filmons:unread-changed', update); };
  }, [user?.id]);

  const isActive = (to: string) => (to === '/' ? location.pathname === '/' : location.pathname.startsWith(to));

  return (
    // sticky (not fixed) so it naturally stops at the bottom of the
    // sidebar+main flex row in Root.tsx instead of staying pinned over the
    // footer below; top-14 accounts for TopBar's 56px on tablet (TopBar is
    // lg:hidden, gone entirely once this reaches lg: and needs top-0).
    <aside className="hidden md:flex md:flex-col sticky top-14 lg:top-0 self-start h-[calc(100vh-3.5rem)] lg:h-screen shrink-0 z-30 w-16 lg:w-64 bg-white border-r border-gray-100">
      <Link to="/" className="flex items-center justify-center lg:justify-start h-14 px-4 border-b border-gray-100 shrink-0">
        <span className="lg:hidden text-lg font-black text-gray-900">F</span>
        <span className="hidden lg:block"><FilmonsLogo iconSize={22} theme="light" /></span>
      </Link>

      {!isAuthenticated || !user ? (
        <div className="flex-1 flex flex-col py-3">
          <NavItem icon={Home}       label="Home"    to="/"        active={isActive('/')} />
          <NavItem icon={CircleHelp} label="Support" to="/support" active={isActive('/support')} />
          <div className="mt-auto px-3 pb-4">
            <button
              onClick={() => navigate('/login')}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-bold"
            >
              <UserPlus className="w-4 h-4" />
              <span className="hidden lg:inline">Log in</span>
            </button>
          </div>
        </div>
      ) : (
        <>
          <nav className="flex-1 py-3 overflow-y-auto">
            <NavItem icon={Home}          label="Home"                     to="/"                    active={isActive('/')} />
            <NavItem icon={Layers}        label="Listings & Opportunities" to="/my-listings"         active={isActive('/my-listings')} />
            <NavItem icon={MessageCircle} label="Messages"                 to="/inbox"               active={isActive('/inbox')}      badge={unreadMsgs} />
            <NavItem icon={Heart}         label="Saved"                    to="/profile?tab=liked"   active={location.pathname === '/profile' && location.search.includes('tab=liked')} />
            <NavItem icon={CalendarDays}  label="Bookings"                 to="/my-orders"           active={isActive('/my-orders')} />
            <NavItem icon={CreditCard}    label="Earnings"                 to="/wallet"              active={isActive('/wallet')} />
            <NavItem icon={Star}          label="Reviews"                  to="/profile?tab=reviews" active={location.pathname === '/profile' && location.search.includes('tab=reviews')} />
            <NavItem icon={BarChart2}     label="Analytics"                to="/dashboard"           active={isActive('/dashboard')} />
            <NavItem icon={Settings}      label="Settings"                 to="/settings"            active={isActive('/settings')} />
            <NavItem icon={CircleHelp}    label="Support"                  to="/support"             active={isActive('/support')} />
          </nav>

          {(() => {
            const tier = normalizeTier(user?.accountType);
            if (tier === 'business') return null; // top tier -- nothing left to upgrade to
            return (
              <div className="hidden lg:block mx-3 mb-3 p-3.5 rounded-2xl bg-gradient-to-br from-gray-900 to-gray-700">
                <div className="flex items-center gap-1.5 mb-1">
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <p className="text-xs font-black text-white">{NEXT_TIER_LABEL[tier]}</p>
                </div>
                <p className="text-[11px] text-white/60 mb-2.5 leading-snug">{NEXT_TIER_SUB[tier]}</p>
                <Link to="/account/upgrade" className="block text-center text-[11px] font-bold text-gray-900 bg-white rounded-lg py-1.5">
                  Learn more
                </Link>
              </div>
            );
          })()}
        </>
      )}
    </aside>
  );
}
