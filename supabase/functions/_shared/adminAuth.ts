// Shared by every admin-facing edge function that needs a real, verified
// admin identity instead of trusting a client-supplied name string. Mints
// and verifies a compact signed token — HMAC-SHA256 via crypto.subtle,
// the same primitive stripe-webhook already uses to verify Stripe's own
// signatures. Requires the ADMIN_SESSION_SECRET function secret.
const ADMIN_SESSION_SECRET = Deno.env.get('ADMIN_SESSION_SECRET') || '';
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12h

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

export async function verifyAdminToken(req: Request): Promise<AdminIdentity | null> {
  // Uses its own header (not Authorization) so it never collides with the
  // Supabase Functions gateway's own bearer-token handling on that header.
  const token = req.headers.get('X-Admin-Token') || '';
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
