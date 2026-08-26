import { useEffect } from 'react';
import { RouterProvider } from 'react-router';
import { router } from './routes';
import { AuthProvider } from './context/AuthContext';
import { FollowProvider } from './context/FollowContext';
import { PostProvider } from './context/PostContext';
import { NotificationsProvider } from './context/NotificationsContext';
import { NotificationBannerProvider } from './components/NotificationBanner';
import { Toaster } from 'sonner';

// One-time cleanup — the old FP (Filmons Points) system cached balances/
// transactions under these keys; stale values must not resurface after
// the system's removal.
function clearDeprecatedFpStorage() {
  try {
    localStorage.removeItem('filmons_fp_accounts');
    localStorage.removeItem('filmons_fp_transactions');
  } catch {}
}

// Filmons is light-mode only now — a returning user's browser may still have
// a stale 'dark' preference saved from before the theme system was removed.
function clearDeprecatedThemeStorage() {
  try {
    localStorage.removeItem('filmons_theme');
    document.documentElement.classList.remove('dark');
  } catch {}
}

export default function App() {
  useEffect(() => {
    clearDeprecatedFpStorage();
    clearDeprecatedThemeStorage();
  }, []);

  return (
    <AuthProvider>
      <FollowProvider>
        <PostProvider>
          <NotificationsProvider>
            <NotificationBannerProvider>
              <RouterProvider router={router} />
              <Toaster richColors position="top-center" />
            </NotificationBannerProvider>
          </NotificationsProvider>
        </PostProvider>
      </FollowProvider>
    </AuthProvider>
  );
}