import { Outlet, useLocation, Navigate } from 'react-router';
import { SideDrawer } from '../components/SideDrawer';
import { TopBar } from '../components/TopBar';
import { MobileBottomNav } from '../components/MobileBottomNav';
import { Footer } from '../components/Footer';
import { NotificationBannerProvider } from '../components/NotificationBanner';
import { SearchOverlay } from '../components/SearchOverlay';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

const NO_NAV_PAGES    = ['/login', '/phone-signup', '/phone-login'];
const NO_FOOTER_PAGES = ['/login', '/phone-signup', '/phone-login', '/inbox', '/feed', '/reels'];
const NO_TOPBAR_PAGES = ['/login', '/phone-signup', '/phone-login'];

export function Root() {
  const location = useLocation();
  const { user, isAuthenticated } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen,  setSearchOpen]  = useState(false);

  const hideAll    = NO_NAV_PAGES.includes(location.pathname);
  const hideTopBar = NO_TOPBAR_PAGES.includes(location.pathname);
  const hideFooter = NO_FOOTER_PAGES.some(p => location.pathname.startsWith(p));

  // Enforce onboarding: authenticated users without a username must complete profile setup
  if (isAuthenticated && !user?.username) {
    return <Navigate to="/complete-profile" replace />;
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
