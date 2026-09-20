// Whether the CURRENT PAGE is being served by the Filmons Learning bundle
// (learning.html) rather than the main app (index.html) -- checked via
// raw window.location, not React Router's useLocation(). Router-relative
// pathnames are basename-STRIPPED (see learningRoutes.tsx: within the
// Learning bundle itself, useLocation().pathname is '/course/xyz', not
// '/learning/course/xyz'), so they can't answer "which bundle is this"
// the way a raw hostname/pathname check can. Used by anything (like
// CourseCard, shared by both bundles) that needs to know whether it's
// safe to plain-navigate or whether crossing into/out of Learning needs
// the branded transition + a real page load.
export function isInsideLearningBundle(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.location.hostname === 'learning.filmons.app') return true;
  return window.location.pathname.startsWith('/learning');
}
