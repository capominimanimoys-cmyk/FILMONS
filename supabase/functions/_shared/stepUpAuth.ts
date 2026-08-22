// Shared by any edge function that needs proof a user just re-authenticated
// (password / phone OTP / OAuth) before a sensitive action — currently only
// the Payout Method Stripe Connect flow. Mints and verifies a short-lived
// signed token, same HMAC-SHA256-via-crypto.subtle primitive as
// adminAuth.ts and stripe-webhook's own signature check. Requires the
// STEP_UP_SESSION_SECRET function secret.
const STEP_UP_SESSION_SECRET = Deno.env.get('STEP_UP_SESSION_SECRET') || '';
const TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes — just long enough to complete the gated flow

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
    'raw', new TextEncoder().encode(STEP_UP_SESSION_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sigBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sigBytes)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function mintStepUpToken(userId: string, purpose: string): Promise<string> {
  const payload = { userId, purpose, exp: Date.now() + TOKEN_TTL_MS };
  const payloadB64 = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await hmac(payloadB64);
  return `${payloadB64}.${sig}`;
}

export async function verifyStepUpToken(token: string, userId: string, purpose: string): Promise<boolean> {
  if (!token || !STEP_UP_SESSION_SECRET) return false;
  const [payloadB64, sig] = token.split('.');
  if (!payloadB64 || !sig) return false;

  const expected = await hmac(payloadB64);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff !== 0) return false;

  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(payloadB64)));
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return false;
    return payload.userId === userId && payload.purpose === purpose;
  } catch {
    return false;
  }
}
