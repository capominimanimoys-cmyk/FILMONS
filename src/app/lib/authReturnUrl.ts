// Carries an intended post-login destination across the phone-login ->
// SMS verification -> device/email verification hop. React Router's
// `state` on a `<Navigate>`/`navigate()` call doesn't survive Root's own
// guard-driven redirects reliably (Root can redirect to /verify-device
// based on auth context changing before a page's own navigate() commits),
// so this uses sessionStorage as the durable handoff instead -- cleared
// once the value is actually consumed at the end of the flow.
const KEY = 'filmons_auth_return_url';

// Never treat an auth-entry page itself as somewhere to return to -- same
// list Root.tsx already excludes from being a valid `from`.
const AUTH_ENTRY_PAGES = ['/login', '/phone-signup', '/phone-login', '/verify-device', '/verify-email'];

// Only a same-origin relative path is ever accepted -- guards against an
// open-redirect via a crafted `?returnUrl=` value.
export function sanitizeReturnUrl(url: unknown): string | null {
  if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//')) return null;
  const pathOnly = url.split('?')[0].split('#')[0];
  if (AUTH_ENTRY_PAGES.includes(pathOnly)) return null;
  return url;
}

export function setPendingReturnUrl(url: string) {
  const safe = sanitizeReturnUrl(url);
  if (!safe) return;
  try { sessionStorage.setItem(KEY, safe); } catch {}
}

export function getPendingReturnUrl(): string | null {
  try { return sessionStorage.getItem(KEY); } catch { return null; }
}

export function consumePendingReturnUrl(): string {
  const url = getPendingReturnUrl();
  try { sessionStorage.removeItem(KEY); } catch {}
  return url || '/';
}
