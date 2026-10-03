import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { pendingAuthStep, setPendingReturnUrl } from '../lib/authReturnUrl';

// Main-app router entry for any /learning/* path. FILMONS Learning is a
// separate bundle (learning.html), so a client-side navigate() there --
// typically an auth flow (Login, OAuthCallback, Onboarding, VerifyDevice)
// finishing with a Learning return URL stashed by learningAuth.ts --
// lands here first. This route sits outside Root, so it re-applies
// Root's own post-sign-in gates (new device, email, onboarding) before
// handing off; the Learning bundle itself doesn't run them.
const RELOAD_GUARD_KEY = 'filmons_learning_reload';

export function LearningReturn() {
  const location = useLocation();
  const { user, deviceVerified } = useAuth();
  const target = location.pathname + location.search + location.hash;
  const waitingOnDeviceCheck = !!user && deviceVerified === null;
  const step = pendingAuthStep(user, deviceVerified);

  useEffect(() => {
    if (waitingOnDeviceCheck || step) return;
    // A full page load is what lets the host's /learning/* rewrite serve
    // learning.html. If this exact URL already reloaded a moment ago, the
    // host served index.html again (no rewrite in this environment) --
    // stop instead of looping.
    try {
      const last = JSON.parse(sessionStorage.getItem(RELOAD_GUARD_KEY) || 'null');
      if (last && last.url === target && Date.now() - last.at < 5000) return;
      sessionStorage.setItem(RELOAD_GUARD_KEY, JSON.stringify({ url: target, at: Date.now() }));
    } catch {}
    window.location.replace(target);
  }, [target, waitingOnDeviceCheck, step]);

  if (step) {
    setPendingReturnUrl(target);
    return <Navigate to={step} state={step === '/verify-device' ? { from: target } : { showReminder: true }} replace />;
  }
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-gray-50">
      <div className="w-5 h-5 border-2 border-gray-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  );
}
