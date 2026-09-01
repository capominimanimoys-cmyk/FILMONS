import { createBrowserRouter, Navigate } from 'react-router';
import { AdminLayout } from './components/AdminLayout';
import { AdminVerifications } from './pages/AdminVerifications';
import { AdminSupportChats } from './pages/AdminSupportChats';
import { AdminBoosts } from './pages/AdminBoosts';
import { AdminComingSoon } from './pages/AdminComingSoon';

// The entire FILMONS Admin route tree, built and shipped as its OWN
// bundle (see admin.html / src/admin-main.tsx) -- not a JS-level import
// boundary inside the normal app's router, an actual separate Rollup
// entry point. Normal FILMONS users loading index.html never fetch any
// module reachable only from here; nothing in this file is imported by
// src/app/routes.tsx.
export const adminRouter = createBrowserRouter([
  {
    path: '/admin',
    Component: AdminLayout,
    children: [
      { index: true, element: <Navigate to="/admin/support-chats" replace /> },
      { path: 'dashboard',     element: <AdminComingSoon title="Dashboard" /> },
      { path: 'verifications', Component: AdminVerifications },
      { path: 'support-chats', Component: AdminSupportChats },
      // Deep link from the "new case" admin-notification email --
      // AdminSupportChats reads :caseNumber and auto-opens that
      // conversation once its case list has loaded.
      { path: 'support/cases/:caseNumber', Component: AdminSupportChats },
      { path: 'boosts',        Component: AdminBoosts },
      { path: 'transactions',  element: <AdminComingSoon title="Transactions" /> },
      { path: 'users',         element: <AdminComingSoon title="Users" /> },
      { path: 'listings',      element: <AdminComingSoon title="Listings" /> },
      { path: 'opportunities', element: <AdminComingSoon title="Opportunities" /> },
      { path: 'reports',       element: <AdminComingSoon title="Reports" /> },
      { path: 'settings',      element: <AdminComingSoon title="Settings" /> },
    ],
  },
  // Any other path under this bundle (e.g. a stale bookmark) -- back to
  // the admin login gate rather than a bare 404.
  { path: '*', element: <Navigate to="/admin" replace /> },
]);
