import { RouterProvider } from 'react-router';
import { router } from './routes';
import { AuthProvider } from './context/AuthContext';
import { PostProvider } from './context/PostContext';
import { ThemeProvider } from './context/ThemeContext';
import { NotificationsProvider } from './context/NotificationsContext';
import { NotificationBannerProvider } from './components/NotificationBanner';
import { Toaster } from 'sonner';

export default function App() {
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