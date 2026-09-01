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
  if (url.hostname === 'admin.filmons.app') {
    url.pathname = '/admin.html';
    return rewrite(url);
  }
}
