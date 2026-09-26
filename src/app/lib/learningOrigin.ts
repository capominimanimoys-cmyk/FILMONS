// FILMONS Learning is reachable BOTH at filmons.app/learning (a same-
// origin path -- see vercel.json's /learning + /learning/(.*) rewrites)
// AND at learning.filmons.app (a real separate origin, once that domain +
// DNS record are added in Vercel) -- both serve the exact same
// learning.html bundle/route tree, just under a different basename (see
// learningRoutes.tsx's createLearningRouter).
//
// Internal "enter Learning" navigation (enterLearning(), below) always
// targets the SAME origin the app is currently running on, appending
// /learning -- it works with zero DNS/domain setup and needs no cross-
// origin session handoff, since localStorage is already shared. Calling
// this FROM learning.filmons.app itself returns just that origin's root
// (no /learning suffix), so it's safe to call from either bundle.
// learning.filmons.app remains a fully independent, valid direct-access
// entry point (a bookmark, a shared link) once wired.
const FILMONS_HOST = 'filmons.app';
const LEARNING_SUBDOMAIN = 'learning.filmons.app';

function isLocalDev(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

/** Base URL to prefix a Learning-bundle-relative path (e.g. '/course/xyz')
 *  with to build the destination for entering Learning. */
export function learningOrigin(): string {
  if (typeof window === 'undefined') return '/learning';
  const { protocol, host, hostname } = window.location;
  if (hostname === LEARNING_SUBDOMAIN) return `${protocol}//${host}`;
  return `${protocol}//${host}/learning`;
}

/** Base URL to prefix a main-Filmons-app-relative path (e.g. '/login')
 *  with when navigating OUT of the Learning bundle back to Filmons --
 *  always a real origin change in production, regardless of whether
 *  Learning was reached via the /learning path or the subdomain. */
export function filmonsOrigin(): string {
  if (isLocalDev()) return `${window.location.protocol}//${window.location.host}`;
  return `https://${FILMONS_HOST}`;
}
