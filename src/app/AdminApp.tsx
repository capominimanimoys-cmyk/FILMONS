import { RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import { createAdminRouter } from './adminRoutes';

// The whole Admin application's React tree. Deliberately does NOT wrap
// AuthProvider/FollowProvider/PostProvider/NotificationsProvider -- those
// exist for the normal FILMONS user session (auth.uid()-less, but still
// a distinct identity/data layer) and no Admin page reads them; the
// Admin pages only ever call adminAuth's own cookie-session check.
//
// Router is created once, at module-evaluation time in the browser (not
// per-render), so its basename ('/admin' vs '/' -- see adminRoutes.tsx)
// is decided from window.location.hostname exactly once per page load.
const router = createAdminRouter();

export default function AdminApp() {
  return (
    <>
      <RouterProvider router={router} />
      <Toaster richColors position="top-center" />
    </>
  );
}
