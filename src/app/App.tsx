import { useEffect } from 'react';
import { RouterProvider } from 'react-router';
import { router } from './routes';
import { AuthProvider } from './context/AuthContext';
import { PostProvider } from './context/PostContext';
import { ThemeProvider } from './context/ThemeContext';
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

export default function App() {
  useEffect(() => { clearDeprecatedFpStorage(); }, []);

  return (
    <ThemeProvider>
      <AuthProvider>
        <PostProvider>
          <NotificationsProvider>
            <NotificationBannerProvider>
              <RouterProvider router={router} />
              <Toaster richColors position="top-center" />
            </NotificationBannerProvider>
          </NotificationsProvider>
        </PostProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}