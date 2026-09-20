// FILMONS Learning is now ONLY reachable at learning.filmons.app -- there
// is no filmons.app/learning path anymore (removed from vercel.json and
// this app's router entirely, per the "Learning is a true separate
// product" spec: "Delete/deprecate the filmons.app/learning route
// completely. Do not redirect users to /learning anywhere."). Crossing
// between the two products is therefore always a real CROSS-ORIGIN
// navigation in production.
//
// The one carve-out: localhost/127.0.0.1 (local dev) falls back to a
// path-based /learning prefix on the SAME origin, since there is no
// second dev server/port for a Learning subdomain to point at locally --
// this is a development convenience only, never a reachable path in any
// real deployment (production or Vercel preview alike hit the two real
// hostnames below).
const LEARNING_HOST = 'learning.filmons.app';
const FILMONS_HOST = 'filmons.app';

function isLocalDev(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

/** Base URL to prefix a Learning-bundle-relative path (e.g. '/course/xyz')
 *  with to build a full cross-origin destination. */
export function learningOrigin(): string {
  if (isLocalDev()) return `${window.location.protocol}//${window.location.host}/learning`;
  return `https://${LEARNING_HOST}`;
}

/** Base URL to prefix a main-Filmons-app-relative path (e.g. '/login')
 *  with when navigating OUT of the Learning bundle back to Filmons. */
export function filmonsOrigin(): string {
  if (isLocalDev()) return `${window.location.protocol}//${window.location.host}`;
  return `https://${FILMONS_HOST}`;
}
