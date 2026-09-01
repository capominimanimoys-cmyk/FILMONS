import { rewrite } from '@vercel/edge';

// Runs at the Vercel Edge, before static-file resolution -- unlike a
// vercel.json "rewrite" (which loses to an exact-matching static file
// like index.html at "/"), this ALWAYS gets first look at the request,
// so a host-conditional rewrite here actually works for every path,
// including "/".
//
// admin.filmons.app -> serve admin.html (the separate Admin bundle --
// see src/app/AdminApp.tsx / adminRoutes.tsx) for every path on that
// host. filmons.app (and any other host) is untouched here; the
// existing vercel.json path-based rule (/admin, /admin/*) keeps serving
// admin.html on the main domain too.
export const config = {
  matcher: '/:path*',
};

export default function middleware(request) {
  const url = new URL(request.url);
  if (url.hostname !== 'admin.filmons.app') return;

  // Only rewrite page navigations (clean, extension-less paths like "/"
  // or "/verifications") to admin.html -- a real static asset request
  // (/assets/admin-*.js, *.css, fonts, images...) must pass through
  // untouched. Without this check the matcher below catches EVERY
  // request on this host, including the admin bundle's own JS file,
  // which then gets rewritten to admin.html's markup instead of served
  // as JS -- the browser fails to execute it and the page stays blank.
  if (/\.[a-zA-Z0-9]+$/.test(url.pathname)) return;

  url.pathname = '/admin.html';
  return rewrite(url);
}
