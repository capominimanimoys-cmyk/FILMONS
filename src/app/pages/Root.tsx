import { Outlet, useLocation, Navigate } from 'react-router';
import { SideDrawer } from '../components/SideDrawer';
import { TopBar } from '../components/TopBar';
import { MobileBottomNav } from '../components/MobileBottomNav';
import { DesktopSidebar } from '../components/DesktopSidebar';
import { DesktopTopBar } from '../components/DesktopTopBar';
import { Footer } from '../components/Footer';
import { NotificationBannerProvider } from '../components/NotificationBanner';
import { SearchOverlay } from '../components/SearchOverlay';
import { GuestBanner } from '../components/GuestBanner';
import { GuestAuthPrompt } from '../components/GuestAuthPrompt';
import { RouteProgressBar } from '../components/RouteProgressBar';
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getPendingReturnUrl } from '../lib/authReturnUrl';
import type { User } from '../types';

const NO_NAV_PAGES    = ['/login', '/phone-signup', '/phone-login', '/verify-device'];
const NO_TOPBAR_PAGES = ['/login', '/phone-signup', '/phone-login', '/share-card'];
// These pages render their own fixed bottom action bar (Back/Next, Save, etc.) —
// the global MobileBottomNav sits on top of it (higher z-index) and hides it.
const NO_BOTTOM_NAV_PAGES = ['/create-listing', '/edit-listing', '/create-opportunity'];

function isOnboardingIncomplete(user: User | null): boolean {
  if (!user) return false;
  // Trust the explicit flag first — set by Onboarding on save and by getMe from DB column
  if (user.profileSetupCompleted) return false;
  // A user with a username has definitely been through onboarding at least once
  if (user.username) return false;
  return true;
}

export function Root() {
  const location = useLocation();
  const { user, isAuthenticated, isGuest, deviceVerified } = useAuth() as any;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen,  setSearchOpen]  = useState(false);
  // Inbox reports whether an active conversation is open on mobile —
  // same window CustomEvent pattern api.ts already uses for
  // 'filmons:unread-changed', not a new context, since there's exactly
  // one producer (Inbox.tsx) and one consumer (here).
  const [conversationOpen, setConversationOpen] = useState(false);
  useEffect(() => {
    const handler = (e: any) => setConversationOpen(!!e.detail?.open);
    window.addEventListener('filmons:inbox-conversation-open', handler);
    return () => window.removeEventListener('filmons:inbox-conversation-open', handler);
  }, []);
  // Defensive reset — Inbox's own unmount cleanup already clears this,
  // but a route change is a cheap second guarantee against it ever
  // sticking on an unrelated page.
  useEffect(() => { if (!location.pathname.startsWith('/inbox')) setConversationOpen(false); }, [location.pathname]);

  // Close the vertical menu on every route change, regardless of how
  // navigation happened (menu link, back/forward, programmatic redirect) —
  // it was staying open across pages since only an explicit tap on the
  // backdrop/link closed it before.
  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  const hideAll      = NO_NAV_PAGES.includes(location.pathname);
  const hideTopBar   = NO_TOPBAR_PAGES.includes(location.pathname);
  const showFooter   = location.pathname === '/';
  const hideBottomNav = NO_BOTTOM_NAV_PAGES.some(p => location.pathname.startsWith(p)) || conversationOpen;

  // New Browser / First Sign-In Verification — checked before anything
  // else that requires a real session. deviceVerified is null until the
  // check resolves; only an explicit false redirects, so a trusted
  // returning user never sees a flash-redirect while it's in flight.
  //
  // This guard can fire while `location.pathname` is still an auth-entry
  // route itself (e.g. the moment right after PhoneLogin's OTP success
  // sets isAuthenticated but before its own navigate('/') has committed) —
  // capturing that as `from` sent VerifyDevice back to /phone-login after
  // a fully successful login, looping the user. None of these routes are
  // ever a real destination to return to; fall back to whatever return
  // destination the login flow itself stashed (see lib/authReturnUrl), or
  // Home if there isn't one.
  if (isAuthenticated && deviceVerified === false && location.pathname !== '/verify-device') {
    const from = NO_NAV_PAGES.includes(location.pathname)
      ? (getPendingReturnUrl() || '/')
      : location.pathname + location.search;
    return <Navigate to="/verify-device" state={{ from }} replace />;
  }

  // Enforce email verification before anything else (skip for guests — they have no user)
  if (isAuthenticated && user?.emailVerified === false) {
    return <Navigate to="/verify-email" replace />;
  }

  // Enforce onboarding: authenticated users who haven't completed setup
  if (isAuthenticated && isOnboardingIncomplete(user)) {
    return <Navigate to="/onboarding" state={{ showReminder: true }} replace />;
  }

  if (hideAll) {
    return (
      <NotificationBannerProvider>
        <div className="min-h-screen flex flex-col">
          <Outlet />
        </div>
      </NotificationBannerProvider>
    );
  }

  return (
    <NotificationBannerProvider>
      <RouteProgressBar />
      <div className="min-h-screen flex flex-col">
        {/* Guest mode banner — shown above everything when browsing without account */}
        {isGuest && !isAuthenticated && <GuestBanner />}

        {sidebarOpen && <SideDrawer onClose={() => setSidebarOpen(false)} />}

        {!hideTopBar && (
          <TopBar
            onMenuClick={() => setSidebarOpen(v => !v)}
            onSearchOpen={() => setSearchOpen(true)}
          />
        )}

        {/* Sidebar + main share a flex row so the sidebar (sticky, not
            fixed) naturally stops at the bottom of this row instead of
            staying pinned over the footer below. */}
        <div className="flex flex-1">
          <DesktopSidebar />

          <main className={`flex-1 min-w-0 md:pb-0 ${hideBottomNav ? '' : 'pb-[calc(54px+env(safe-area-inset-bottom))]'}`}>
            {!hideTopBar && <DesktopTopBar onSearchOpen={() => setSearchOpen(true)} />}
            <Outlet />
          </main>
        </div>

        {/* Footer — Home only, full width under the sidebar too (see above) */}
        {showFooter && (
          <div className="hidden md:block">
            <Footer />
          </div>
        )}

        {!hideBottomNav && <MobileBottomNav />}

        {/* AI Search overlay — rendered above everything */}
        {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} />}

        {/* Guest auth prompt — rendered globally, triggered via showGuestPrompt() */}
        <GuestAuthPrompt />
      </div>
    </NotificationBannerProvider>
  );
}
