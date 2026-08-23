// Shared by device-check / device-send-code / device-verify-code.
// Hashes only -- the raw device token and raw 6-digit code are never
// persisted, matching admin_users/payout_methods' convention. No HMAC
// signing needed here (unlike adminAuth.ts's session token): these
// values are single-use or looked up by hash directly, never decoded
// back out of a payload.

export async function hashSecret(raw: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(bytes)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function randomCode(): string {
  // crypto.getRandomValues, not Math.random -- this gates account access.
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return String(n).padStart(6, '0');
}

const ALLOWED_ORIGIN_SUFFIXES = ['.vercel.app'];
const ALLOWED_ORIGINS = ['https://filmons.app', 'https://www.filmons.app', 'http://localhost:5173', 'http://localhost:3000'];

// Credentialed (cookie-bearing) fetches can't use Access-Control-Allow-Origin: '*'
// per the Fetch spec -- every other edge function in this app uses '*', but
// these three need a reflected, allowlisted origin instead.
export function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGIN_SUFFIXES.some(s => origin.endsWith(s));
  return {
    'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
  };
}

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return null;
}
