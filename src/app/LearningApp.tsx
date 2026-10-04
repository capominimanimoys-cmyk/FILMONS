import { RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import { createLearningRouter } from './learningRoutes';
import { AuthProvider } from './context/AuthContext';
import { FollowProvider } from './context/FollowContext';
import { PostProvider } from './context/PostContext';
import { NotificationsProvider } from './context/NotificationsContext';
import { NotificationBannerProvider } from './components/NotificationBanner';
import { LearningTransitionProvider } from './context/LearningTransitionContext';
import { LearningSessionProvider } from './context/LearningSessionContext';
import { usePopIn } from './lib/usePopIn';

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
  // Pop-in appearance for every [data-pop] element in Learning.
  usePopIn();
  return (
    <AuthProvider>
      {/* Learning has its own sign-in step on top of the shared FILMONS
          account -- everything below sees the user only once they've
          signed in to Learning (see LearningSessionContext). */}
      <LearningSessionProvider>
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
      </LearningSessionProvider>
    </AuthProvider>
  );
}
