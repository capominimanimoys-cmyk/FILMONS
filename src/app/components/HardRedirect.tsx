import { useEffect } from 'react';

// A full page navigation, not react-router's client-side <Navigate>.
// Needed for any link into /admin/* -- that path is a separate Rollup
// bundle now (admin.html), not a route this app's router even knows
// about, so only a real browser navigation (which lets Vercel's rewrite
// serve admin.html) can land there. See src/app/adminRoutes.tsx.
export function HardRedirect({ to }: { to: string }) {
  useEffect(() => {
    window.location.replace(to);
  }, [to]);
  return null;
}
