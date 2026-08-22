/**
 * Canonical production origin for OAuth redirects.
 *
 * Falls back to window.location.origin so local dev and Vercel preview
 * deployments keep working without any env var set. Production MUST set
 * VITE_APP_URL=https://filmons.app in Vercel so Google/Supabase OAuth
 * always returns users to the canonical domain — never a Vercel
 * preview/deployment URL — regardless of which origin the auth flow
 * happened to start from.
 */
export function getAppOrigin(): string {
  const configured = import.meta.env.VITE_APP_URL as string | undefined;
  return configured ? configured.replace(/\/$/, '') : window.location.origin;
}

export function getOAuthRedirectUrl(path = '/auth/callback'): string {
  return `${getAppOrigin()}${path}`;
}
