// Portfolio "attached link" helpers.
// Only http(s) links are ever stored or rendered as links -- anything else
// (javascript:, data:, mailto:...) is rejected, so a pasted value can never
// become a script/odd-scheme href.

/** Normalises user input to a safe absolute http(s) URL, or null if it isn't one.
 *  "example.com/work" -> "https://example.com/work". Empty input -> null. */
export function normalizeExternalLink(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim();
  if (!v) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (!u.hostname.includes('.')) return null; // "foo" / "localhost" aren't shareable links
    return u.href;
  } catch { return null; }
}

/** Short display label: hostname without "www." ("vimeo.com"). */
export function externalLinkLabel(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}
