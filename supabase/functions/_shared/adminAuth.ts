// Shared by every admin-facing edge function that needs a real, verified
// admin identity instead of trusting a client-supplied name string. Mints
// and verifies a compact signed token — HMAC-SHA256 via crypto.subtle,
// the same primitive stripe-webhook already uses to verify Stripe's own
// signatures. Requires the ADMIN_SESSION_SECRET function secret.
//
// Transport: an HttpOnly, Secure session cookie -- never a header the
// frontend's own JS reads or stores (no sessionStorage/localStorage
// token, unlike the old X-Admin-Token model this replaced). A session
// cookie (no Max-Age) so it's cleared when the browser closes, plus a
// bounded absolute TTL as a backstop. Requests must reach this function
// same-origin (via the /api/fn/* Vercel rewrite -- see vercel.json) for
// the browser to attach it at all; this deliberately avoids needing
// cross-site SameSite=None cookies or Access-Control-Allow-Credentials.
const ADMIN_SESSION_SECRET = Deno.env.get('ADMIN_SESSION_SECRET') || '';
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000; // 8h absolute cap
export const ADMIN_SESSION_COOKIE = 'filmons_admin_session';

export interface AdminIdentity {
  adminId: string;
  name: string;
  role: 'super_admin' | 'support_agent';
}

function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(str: string): Uint8Array {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin = atob(b64);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

async function hmac(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(ADMIN_SESSION_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sigBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sigBytes)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function mintAdminToken(identity: AdminIdentity): Promise<string> {
  const payload = { ...identity, exp: Date.now() + TOKEN_TTL_MS };
  const payloadB64 = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await hmac(payloadB64);
  return `${payloadB64}.${sig}`;
}

async function verifyTokenString(token: string): Promise<AdminIdentity | null> {
  if (!token || !ADMIN_SESSION_SECRET) return null;
  const [payloadB64, sig] = token.split('.');
  if (!payloadB64 || !sig) return null;

  const expected = await hmac(payloadB64);
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff !== 0) return null;

  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(payloadB64)));
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    if (!payload.adminId || !payload.name || !payload.role) return null;
    return { adminId: payload.adminId, name: payload.name, role: payload.role };
  } catch {
    return null;
  }
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

// The only entry point every admin-action edge function calls -- reads
// the session cookie (not a header) and verifies it.
export async function verifyAdminToken(req: Request): Promise<AdminIdentity | null> {
  const token = readCookie(req, ADMIN_SESSION_COOKIE) || '';
  return verifyTokenString(token);
}

// Set-Cookie value for a freshly verified login -- HttpOnly (invisible to
// JS entirely), Secure (HTTPS only), SameSite=Lax (same-origin via the
// rewrite proxy anyway, Lax still allows top-level navigations like the
// support deep-link email), no Max-Age (browser-session cookie).
export function buildSessionCookieHeader(token: string): string {
  return `${ADMIN_SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

// Immediately expires the cookie -- used by logout and by a failed/burned
// verification, so a stale cookie can't linger client-side.
export function buildClearCookieHeader(): string {
  return `${ADMIN_SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
