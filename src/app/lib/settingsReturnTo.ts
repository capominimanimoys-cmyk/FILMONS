// Carries the page a user opened Settings (or a settings subpage reachable
// from outside the settings section, e.g. Portfolio's gear icon) from, so
// that page's Back button can return there instead of always landing on
// the main Settings hub. sessionStorage (not router `state`) so it
// survives a refresh of the settings page itself -- same convention as
// authReturnUrl.ts. Consumed (cleared) on read so a later, unrelated visit
// to the same settings subpage via the main hub doesn't inherit a stale
// value and send Back to the wrong place.
const KEY = 'filmons_settings_return_to';

export function sanitizeSettingsReturnTo(url: unknown): string | null {
  if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//')) return null;
  if (url.startsWith('/settings')) return null; // only an external entry point is worth remembering
  return url;
}

export function setSettingsReturnTo(url: string) {
  const safe = sanitizeSettingsReturnTo(url);
  if (!safe) return;
  try { sessionStorage.setItem(KEY, safe); } catch {}
}

export function consumeSettingsReturnTo(): string | null {
  let url: string | null = null;
  try { url = sessionStorage.getItem(KEY); sessionStorage.removeItem(KEY); } catch {}
  return url;
}
