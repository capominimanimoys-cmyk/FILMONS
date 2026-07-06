import { Outlet, useLocation, Navigate } from 'react-router';
import { SideDrawer } from '../components/SideDrawer';
import { TopBar } from '../components/TopBar';
import { MobileBottomNav } from '../components/MobileBottomNav';
import { Footer } from '../components/Footer';
import { NotificationBannerProvider } from '../components/NotificationBanner';
import { SearchOverlay } from '../components/SearchOverlay';
import { GuestBanner } from '../components/GuestBanner';
import { GuestAuthPrompt } from '../components/GuestAuthPrompt';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import type { User } from '../types';

const NO_NAV_PAGES    = ['/login', '/phone-signup', '/phone-login'];
const NO_FOOTER_PAGES = ['/login', '/phone-signup', '/phone-login', '/inbox', '/feed', '/reels'];
const NO_TOPBAR_PAGES = ['/login', '/phone-signup', '/phone-login'];

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
  const { user, isAuthenticated, isGuest } = useAuth() as any;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen,  setSearchOpen]  = useState(false);

  const hideAll    = NO_NAV_PAGES.includes(location.pathname);
  const hideTopBar = NO_TOPBAR_PAGES.includes(location.pathname);
  const hideFooter = NO_FOOTER_PAGES.some(p => location.pathname.startsWith(p));

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

        <main className="flex-1 pb-[calc(64px+env(safe-area-inset-bottom))] md:pb-0">
          <Outlet />
        </main>

        {!hideFooter && (
          <div className="hidden md:block">
            <Footer />
          </div>
        )}

        <MobileBottomNav />

        {/* AI Search overlay — rendered above everything */}
        {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} />}

        {/* Guest auth prompt — rendered globally, triggered via showGuestPrompt() */}
        <GuestAuthPrompt />
      </div>
    </NotificationBannerProvider>
  );
}
