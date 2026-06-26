import { Outlet, useLocation, Navigate } from 'react-router';
import { SideDrawer } from '../components/SideDrawer';
import { TopBar } from '../components/TopBar';
import { MobileBottomNav } from '../components/MobileBottomNav';
import { Footer } from '../components/Footer';
import { NotificationBannerProvider } from '../components/NotificationBanner';
import { SearchOverlay } from '../components/SearchOverlay';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import type { User } from '../types';

const NO_NAV_PAGES    = ['/login', '/phone-signup', '/phone-login'];
const NO_FOOTER_PAGES = ['/login', '/phone-signup', '/phone-login', '/inbox', '/feed', '/reels'];
const NO_TOPBAR_PAGES = ['/login', '/phone-signup', '/phone-login'];

function isOnboardingIncomplete(user: User | null): boolean {
  if (!user) return false;
  if (user.profileSetupCompleted) return false;
  return !(user.username && user.city && user.primaryRole);
}

export function Root() {
  const location = useLocation();
  const { user, isAuthenticated } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen,  setSearchOpen]  = useState(false);

  const hideAll    = NO_NAV_PAGES.includes(location.pathname);
  const hideTopBar = NO_TOPBAR_PAGES.includes(location.pathname);
  const hideFooter = NO_FOOTER_PAGES.some(p => location.pathname.startsWith(p));

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
      </div>
    </NotificationBannerProvider>
  );
}
