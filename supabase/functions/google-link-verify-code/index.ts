// Verifies the code sent by google-link-send-code. On success this only
// confirms email ownership -- it does not itself write profile_meta or
// claim the identity; OAuthCallback.tsx does that afterward through the
// normal service-role /users/:id PUT + claim-identity call, same as it
// already did after the old password-based check.
import { hashSecret } from '../_shared/deviceAuth.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const { profileId, googleUserId, code } = await req.json();
    if (!profileId || !googleUserId || !code) return json({ error: 'Missing profileId, googleUserId or code' }, 400);

    const row = await selectOne('google_link_verification_codes', `profile_id=eq.${profileId}&used_at=is.null&order=created_at.desc`);
    if (!row) return json({ error: 'No active code — request a new one' }, 400);
    if (new Date(row.expires_at).getTime() < Date.now()) return json({ error: 'Code expired — request a new one' }, 400);
    if (row.attempts >= MAX_ATTEMPTS) return json({ error: 'Too many attempts — request a new code' }, 400);

    // The Google identity being linked must be the same one this code was
    // issued for -- guards against a stale code from an earlier "Use
    // another Google account" attempt being replayed against a different
    // identity.
    if (row.google_user_id !== googleUserId) {
      return json({ error: 'This request has changed — please start again' }, 400);
    }

    const codeHash = await hashSecret(String(code));
    if (codeHash !== row.code_hash) {
      await fetch(rest(`/google_link_verification_codes?id=eq.${row.id}`), {
        method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
        body: JSON.stringify({ attempts: row.attempts + 1 }),
      });
      const remaining = MAX_ATTEMPTS - (row.attempts + 1);
      return json({ error: 'Incorrect code', attemptsRemaining: Math.max(0, remaining) }, 400);
    }

    await fetch(rest(`/google_link_verification_codes?id=eq.${row.id}`), {
      method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({ used_at: new Date().toISOString() }),
    });

    return json({ success: true });
  } catch (e) {
    console.error('google-link-verify-code error:', e);
    return json({ error: 'Internal error' }, 500);
  }
});
