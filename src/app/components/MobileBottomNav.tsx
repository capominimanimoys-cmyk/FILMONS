import { Link, useLocation } from 'react-router';
import { Home, Search, Plus, MessageCircle, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { chatApi } from '../lib/api';
import { useState, useEffect } from 'react';
import { captureSnapshot } from '../lib/smartAnimate';

export function MobileBottomNav() {
  const location = useLocation();
  const { user, isAuthenticated } = useAuth();
  const [unreadMsgs, setUnreadMsgs] = useState(0);
  const [dimmed, setDimmed] = useState(false);
  // Home -> Portfolio mode auto-hide -- full slide-away (not just the dim
  // effect below), driven by Home.tsx's own Portfolio-feed scroll handler
  // via the same window CustomEvent bridge TopBar.tsx listens for. Only
  // Home ever dispatches `hidden: true`, and it always clears this on
  // leaving Portfolio mode / unmounting, so it never lingers on another page.
  const [portfolioHidden, setPortfolioHidden] = useState(false);
  useEffect(() => {
    const handler = (e: any) => setPortfolioHidden(!!e.detail?.hidden);
    window.addEventListener('filmons:home-bars-hidden', handler);
    return () => window.removeEventListener('filmons:home-bars-hidden', handler);
  }, []);

  // Mirrors Home.tsx's homeMode -- Home is the sole source of truth (it owns
  // the sessionStorage key and broadcasts on every change); this is just a
  // read-only reflection so the center + button's destination/label can
  // update the instant the Listings/Portfolio toggle is tapped, with no page
  // refresh, without this component inventing its own independent mode state.
  const [homeMode, setHomeMode] = useState<'listings' | 'portfolio'>(() => {
    try { return sessionStorage.getItem('filmons_home_mode') === 'portfolio' ? 'portfolio' : 'listings'; } catch { return 'listings'; }
  });
  useEffect(() => {
    const handler = (e: any) => setHomeMode(e.detail?.mode === 'portfolio' ? 'portfolio' : 'listings');
    window.addEventListener('filmons:home-mode-changed', handler);
    return () => window.removeEventListener('filmons:home-mode-changed', handler);
  }, []);

  useEffect(() => {
    if (!user) { setUnreadMsgs(0); return; }
    const update = () => setUnreadMsgs(chatApi.getUnreadCount(user.id));
    update();
    const t = setInterval(update, 15_000);
    // Instant update when a conversation is marked read
    window.addEventListener('filmons:unread-changed', update);
    return () => { clearInterval(t); window.removeEventListener('filmons:unread-changed', update); };
  }, [user?.id]);

  // Fade toward translucent while the user is actively scrolling down (out of
  // the way of content), back to fully opaque near the top or on scroll-up —
  // a small +/-4px deadzone keeps it from flickering on sub-pixel deltas.
  useEffect(() => {
    let lastY = window.scrollY;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        if (y < 24) setDimmed(false);
        else if (y > lastY + 4) setDimmed(true);
        else if (y < lastY - 4) setDimmed(false);
        lastY = y;
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Contextual + button: only on Home itself does its action depend on the
  // Listings/Portfolio toggle. Everywhere else it's the app's normal
  // creation entry point (Create Listing) unchanged -- "do not let the +
  // behavior depend on stale Home state" outside Home.
  const isHomeRoute = location.pathname === '/';
  // Connect (homeMode 'portfolio', despite the name) is the social/
  // professional feed now, so its + action is Create Post, not Add
  // Portfolio Work -- per spec, Portfolio creation stays reachable from
  // Portfolio/Profile surfaces, just no longer from this button. Since
  // Connect only ever renders on Home itself, "opening" Create Post here
  // means firing an event for the already-mounted Home.tsx to handle
  // (its own shared PostComposer instance), not a route navigation --
  // `to="/"` is a same-route no-op Link, kept only so this stays a real
  // link element consistent with the other tabs.
  const primaryOpensCreatePost = isHomeRoute && homeMode === 'portfolio';
  const primaryTo = primaryOpensCreatePost ? '/' : '/create-listing';
  const primaryLabel = primaryOpensCreatePost ? 'Create post' : 'Create listing';

  const tabs = [
    { to: '/',                                   Icon: Home,          label: 'Home',     badge: 0,          isPrimary: false },
    { to: '/search',                             Icon: Search,        label: 'Search',   badge: 0,          isPrimary: false },
    { to: primaryTo,                             Icon: null,          label: 'Create',   badge: 0,          isPrimary: true  },
    { to: isAuthenticated ? '/inbox'   : '/login', Icon: MessageCircle, label: 'Messages', badge: unreadMsgs, isPrimary: false },
    { to: isAuthenticated ? '/profile' : '/login', Icon: User,          label: 'Profile',  badge: 0,          isPrimary: false },
  ] as const;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-100/80 md:hidden"
      style={{
        background: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        transform: portfolioHidden ? 'translateY(100%)' : 'translateY(0)',
        opacity: portfolioHidden ? 0 : (dimmed ? 0.4 : 1),
        transition: 'transform 300ms ease-out, opacity 250ms ease-out',
        pointerEvents: portfolioHidden ? 'none' : 'auto',
      }}
    >
      {/* h-14 (56px) -- fixed, not just intrinsic content height. Without
          this the row's natural height shifts by a couple px depending on
          which tab is active (active icons render larger), which is what
          made ProfileStickyActionBar's hardcoded 56px offset drift out of
          alignment with the real nav instead of sitting flush against it. */}
      <div className="flex items-end h-14">
        {tabs.map(({ to, Icon, label, badge, isPrimary }) => {
          // Home tab: only exact match
          const isHome   = to === '/';
          const isActive = !isPrimary && (
            isHome ? location.pathname === '/' : location.pathname.startsWith(to as string)
          );

          if (isPrimary) {
            return (
              <Link
                key="primary"
                to={primaryTo}
                title={primaryLabel}
                aria-label={primaryLabel}
                onClick={() => { captureSnapshot(); if (primaryOpensCreatePost) window.dispatchEvent(new CustomEvent('filmons:open-create-post')); }}
                className="flex-1 flex flex-col items-center justify-center pt-1.5 pb-1.5"
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shadow-lg transition-all active:scale-95"
                  style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)' }}
                >
                  <Plus className="w-[18px] h-[18px] text-white" strokeWidth={2.5}/>
                </div>
              </Link>
            );
          }

          return (
            <Link
              key={to}
              to={to}
              onClick={captureSnapshot}
              className="flex-1 flex flex-col items-center justify-center pt-1.5 pb-0.5 relative"
            >
              {/* Active pip */}
              <span
                className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 rounded-full bg-black"
                style={{
                  width:   isActive ? '24px' : '0px',
                  opacity: isActive ? 1 : 0,
                  transition: 'width 220ms cubic-bezier(0.34,1.4,0.64,1), opacity 150ms ease',
                }}
              />

              <div className="relative">
                {Icon && (
                  <Icon
                    className={`transition-all ${isActive ? 'text-black' : 'text-gray-400'}`}
                    style={{
                      width:       isActive ? '21px' : '19px',
                      height:      isActive ? '21px' : '19px',
                      strokeWidth: isActive ? 2.25 : 1.75,
                      transition: 'width 200ms cubic-bezier(0.34,1.4,0.64,1), height 200ms, color 150ms ease',
                    }}
                  />
                )}
                {badge > 0 && (
                  <span className="absolute -top-1 -right-1.5 min-w-[14px] h-[14px] bg-red-500 text-white text-[7px] font-bold rounded-full flex items-center justify-center px-0.5">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </div>

              <span
                className="text-[8px] font-semibold mt-0.5 tracking-wide"
                style={{
                  color:   isActive ? '#000' : '#9ca3af',
                  opacity: isActive ? 1 : 0.8,
                  transition: 'color 150ms ease',
                }}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
