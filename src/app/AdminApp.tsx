import { RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import { adminRouter } from './adminRoutes';

// The whole Admin application's React tree. Deliberately does NOT wrap
// AuthProvider/FollowProvider/PostProvider/NotificationsProvider -- those
// exist for the normal FILMONS user session (auth.uid()-less, but still
// a distinct identity/data layer) and no Admin page reads them; the
// Admin pages only ever call adminAuth's own cookie-session check.
export default function AdminApp() {
  return (
    <>
      <RouterProvider router={adminRouter} />
      <Toaster richColors position="top-center" />
    </>
  );
}
