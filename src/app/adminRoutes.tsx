import { createBrowserRouter, Navigate } from 'react-router';
import { AdminLayout } from './components/AdminLayout';
import { AdminDashboardHome } from './pages/AdminDashboardHome';
import { AdminUsers } from './pages/AdminUsers';
import { AdminUserDetail } from './pages/AdminUserDetail';
import { AdminTransactions } from './pages/AdminTransactions';
import { AdminTransactionDetail } from './pages/AdminTransactionDetail';
import { AdminVerifications } from './pages/AdminVerifications';
import { AdminWallet } from './pages/AdminWallet';
import { AdminSettings } from './pages/AdminSettings';
import { AdminListings } from './pages/AdminListings';
import { AdminListingDetail } from './pages/AdminListingDetail';
import { AdminOpportunities } from './pages/AdminOpportunities';
import { AdminOpportunityDetail } from './pages/AdminOpportunityDetail';
import { AdminSupportChats } from './pages/AdminSupportChats';
import { AdminBoosts } from './pages/AdminBoosts';
import { AdminComingSoon } from './pages/AdminComingSoon';

// Every path below is written RELATIVE TO THE BASENAME -- never hardcode
// '/admin' anywhere in this tree, in AdminLayout's nav, or in any Admin
// page's internal links. React Router prepends/strips the basename for
// you, so the exact same tree serves two different real URL shapes:
//   filmons.app/admin/...        (basename '/admin', today's setup)
//   admin.filmons.app/...        (basename '', once that subdomain/DNS
//                                  record exists -- see createAdminRouter)
const adminRouteTree = [
  {
    path: '/',
    Component: AdminLayout,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard',     Component: AdminDashboardHome },
      { path: 'verifications', Component: AdminVerifications },
      { path: 'support-chats', Component: AdminSupportChats },
      // Deep link from the "new case" admin-notification email --
      // AdminSupportChats reads :caseNumber and auto-opens that
      // conversation once its case list has loaded.
      { path: 'support/cases/:caseNumber', Component: AdminSupportChats },
      { path: 'users',         Component: AdminUsers },
      { path: 'users/:userId', Component: AdminUserDetail },
      { path: 'listings',      Component: AdminListings },
      { path: 'listings/:listingId', Component: AdminListingDetail },
      { path: 'opportunities', Component: AdminOpportunities },
      { path: 'opportunities/:opportunityId', Component: AdminOpportunityDetail },
      { path: 'transactions',  Component: AdminTransactions },
      { path: 'transactions/:orderId', Component: AdminTransactionDetail },
      { path: 'wallet',        Component: AdminWallet },
      { path: 'boosts',        Component: AdminBoosts },
      { path: 'reports',       element: <AdminComingSoon title="Reports" /> },
      { path: 'settings',      Component: AdminSettings },
    ],
  },
  // Any other path under this bundle (e.g. a stale bookmark) -- back to
  // the admin login gate rather than a bare 404.
  { path: '*', element: <Navigate to="/" replace /> },
];

// admin.html (this bundle's entry) is reachable two ways -- see
// vercel.json: filmons.app/admin/* (path-based rewrite, works today) and
// admin.filmons.app/* (host-based rewrite, works once that domain +
// DNS record are added in Vercel). Same JS, same route tree, only the
// basename differs, decided once at router-creation time from the
// hostname actually serving the page.
export function createAdminRouter() {
  const onDedicatedSubdomain = typeof window !== 'undefined'
    && window.location.hostname === 'admin.filmons.app';
  return createBrowserRouter(adminRouteTree, {
    basename: onDedicatedSubdomain ? '/' : '/admin',
  });
}
