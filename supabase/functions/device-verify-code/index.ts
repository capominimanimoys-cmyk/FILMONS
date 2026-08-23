// Verifies a device-verification code and, on success, trusts this
// browser — sets an HttpOnly cookie carrying a raw device token (never
// returned in the JSON body, only via Set-Cookie) whose hash is stored
// in trusted_devices. 5 wrong attempts on a given code locks it out;
// the user has to request a fresh one (device-send-code already
// invalidates prior open codes on each new send).
import { hashSecret, randomToken, readCookie, corsHeadersFor } from '../_shared/deviceAuth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY };
function rest(path: string) { return `${SUPABASE_URL}/rest/v1${path}`; }

async function selectOne(table: string, filter: string) {
  const res = await fetch(rest(`/${table}?${filter}&select=*&limit=1`), { headers: H });
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] : null;
}

const MAX_ATTEMPTS = 5;
const DEVICE_TOKEN_MAX_AGE = 90 * 24 * 60 * 60; // seconds — matches trusted_devices.expires_at default

Deno.serve(async (req) => {
  const cors = corsHeadersFor(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...cors, 'Content-Type': 'application/json' } });

  try {
    const { userId, code, browserInfo, deviceInfo } = await req.json();
    if (!userId || !code) return new Response(JSON.stringify({ error: 'Missing userId or code' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });

    const row = await selectOne('device_verification_codes', `user_id=eq.${userId}&used_at=is.null&order=created_at.desc`);
    if (!row) return new Response(JSON.stringify({ error: 'No active code — request a new one' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (new Date(row.expires_at).getTime() < Date.now()) return new Response(JSON.stringify({ error: 'Code expired — request a new one' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (row.attempts >= MAX_ATTEMPTS) return new Response(JSON.stringify({ error: 'Too many attempts — request a new code' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });

    const codeHash = await hashSecret(String(code));
    if (codeHash !== row.code_hash) {
      await fetch(rest(`/device_verification_codes?id=eq.${row.id}`), {
        method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
        body: JSON.stringify({ attempts: row.attempts + 1 }),
      });
      const remaining = MAX_ATTEMPTS - (row.attempts + 1);
      return new Response(JSON.stringify({ error: 'Incorrect code', attemptsRemaining: Math.max(0, remaining) }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    await fetch(rest(`/device_verification_codes?id=eq.${row.id}`), {
      method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({ used_at: new Date().toISOString() }),
    });

    // If this browser already has a trusted_devices row (a stale-reauth
    // case — the device itself was never untrusted, just its
    // last_authenticated_at aged past TRUSTED_DEVICE_REAUTH_DAYS),
    // refresh that row in place rather than piling up a duplicate one
    // for the same physical device.
    const nowIso = new Date().toISOString();
    const existingRawToken = readCookie(req, 'fm_device');
    const existing = existingRawToken
      ? await selectOne('trusted_devices', `user_id=eq.${userId}&device_token_hash=eq.${await hashSecret(existingRawToken)}`)
      : null;

    let rawToken: string;
    if (existing) {
      rawToken = existingRawToken!;
      await fetch(rest(`/trusted_devices?id=eq.${existing.id}`), {
        method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
        body: JSON.stringify({
          last_authenticated_at: nowIso, last_used_at: nowIso,
          expires_at: new Date(Date.now() + DEVICE_TOKEN_MAX_AGE * 1000).toISOString(),
          revoked_at: null,
        }),
      });
    } else {
      rawToken = randomToken();
      const tokenHash = await hashSecret(rawToken);
      await fetch(rest('/trusted_devices'), {
        method: 'POST', headers: { ...H, Prefer: 'return=minimal' },
        body: JSON.stringify({
          user_id: userId, device_token_hash: tokenHash,
          browser_info: browserInfo || null, device_info: deviceInfo || null,
          last_authenticated_at: nowIso,
        }),
      });
    }

    const headers = new Headers({ ...cors, 'Content-Type': 'application/json' });
    headers.append('Set-Cookie', `fm_device=${rawToken}; HttpOnly; Secure; SameSite=Lax; Max-Age=${DEVICE_TOKEN_MAX_AGE}; Path=/`);
    return new Response(JSON.stringify({ success: true }), { headers });
  } catch (e) {
    console.error('device-verify-code error:', e);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
