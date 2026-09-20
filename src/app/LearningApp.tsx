import { RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import { createLearningRouter } from './learningRoutes';
import { AuthProvider } from './context/AuthContext';
import { FollowProvider } from './context/FollowContext';
import { PostProvider } from './context/PostContext';
import { NotificationsProvider } from './context/NotificationsContext';
import { NotificationBannerProvider } from './components/NotificationBanner';
import { LearningTransitionProvider } from './context/LearningTransitionContext';

// Filmons Learning's whole React tree, a real separate Rollup entry (see
// learning.html) -- unlike AdminApp.tsx, this DOES wrap the normal
// Filmons identity providers (Auth/Follow/Post/Notifications): Learning
// uses the SAME Filmons account, never a second login (per spec section
// 1/13). Same-origin path-based serving (filmons.app/learning/*, today)
// already shares localStorage with the main bundle for free; once
// learning.filmons.app (a real different origin) is wired in Vercel, the
// session won't cross automatically any more -- see
// LearningTransitionContext's header comment and this file's own note
// below for what that needs.
//
// Router is created once, at module-evaluation time in the browser (not
// per-render), so its basename ('/learning' vs '/' -- see
// learningRoutes.tsx) is decided from window.location.hostname exactly
// once per page load, same pattern createAdminRouter() already uses.
const router = createLearningRouter();

export default function LearningApp() {
  return (
    <AuthProvider>
      <FollowProvider>
        <PostProvider>
          <NotificationsProvider>
            <NotificationBannerProvider>
              <LearningTransitionProvider>
                <RouterProvider router={router} />
                <Toaster richColors position="top-center" />
              </LearningTransitionProvider>
            </NotificationBannerProvider>
          </NotificationsProvider>
        </PostProvider>
      </FollowProvider>
    </AuthProvider>
  );
}
