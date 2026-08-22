// "Verify It's You" step-up gate — the first re-authentication check in
// this app. Currently only guards the Payout Method Stripe Connect flow.
// All three methods are verified server-side in this single request (never
// trusts a client claim of "I already checked"); on success mints a
// short-lived stepUpToken (see _shared/stepUpAuth.ts) the caller must then
// present to payout-connect-start.
import { mintStepUpToken } from '../_shared/stepUpAuth.ts';

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

const PURPOSE = 'payout_method';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const body = await req.json();
    const { userId, method } = body;
    if (!userId || !method) return json({ error: 'Missing userId or method' }, 400);

    const profile = await selectOne('profiles', `id=eq.${userId}`);
    if (!profile) return json({ error: 'Account not found' }, 404);

    if (method === 'password') {
      const { password } = body;
      if (!password || !profile.email) return json({ error: 'Password required' }, 400);

      // Same GoTrue password grant supabase.auth.signInWithPassword uses
      // client-side — done server-side here so the edge function itself
      // verifies the password, never trusting a client-supplied result.
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SERVICE_KEY },
        body: JSON.stringify({ email: profile.email, password }),
      });
      if (!res.ok) return json({ error: 'Incorrect password' }, 401);

      const stepUpToken = await mintStepUpToken(userId, PURPOSE);
      return json({ success: true, stepUpToken });
    }

    if (method === 'phone') {
      const { phone, code } = body;
      if (!phone || !code) return json({ error: 'Phone and code required' }, 400);
      if (!profile.phone || phone !== profile.phone) {
        return json({ error: 'This is not your verified phone number' }, 400);
      }

      // Server-to-server call into the same Twilio-backed verify endpoint
      // the client already uses (authApi.verifyPhoneOTP) — the OTP is
      // actually checked here, not just assumed from a client claim.
      const res = await fetch(`${SUPABASE_URL}/functions/v1/make-server-ec8fe879/verify-phone-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({ phone, code }),
      });
      if (!res.ok) return json({ error: 'Incorrect or expired code' }, 401);

      const stepUpToken = await mintStepUpToken(userId, PURPOSE);
      return json({ success: true, stepUpToken });
    }

    if (method === 'oauth') {
      const { accessToken } = body;
      if (!accessToken) return json({ error: 'Missing OAuth session' }, 400);

      const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { Authorization: `Bearer ${accessToken}`, apikey: SERVICE_KEY },
      });
      if (!res.ok) return json({ error: 'Could not verify OAuth session' }, 401);
      const oauthUser = await res.json();
      if (!oauthUser?.email || oauthUser.email.toLowerCase() !== (profile.email || '').toLowerCase()) {
        return json({ error: 'That account does not match your Filmons email' }, 401);
      }

      const stepUpToken = await mintStepUpToken(userId, PURPOSE);
      return json({ success: true, stepUpToken });
    }

    return json({ error: 'Unsupported verification method' }, 400);
  } catch (e) {
    console.error('verify-identity error:', e);
    return json({ error: 'Internal error' }, 500);
  }
});
