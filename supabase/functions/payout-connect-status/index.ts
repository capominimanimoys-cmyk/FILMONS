// UI-confirmation-only GET, called when the client returns from Stripe's
// hosted onboarding — same convention as every other charge function's
// /verify?session_id= endpoint. Always hits Stripe live (never trusts a
// local cache) and delegates to the shared sync helper so this and the
// account.updated webhook never disagree on what counts as "ready".
// stripe-webhook remains the authoritative background sync; this is just
// the fast path so the return screen doesn't have to wait on a webhook.
import { syncPayoutMethodFromStripeAccount } from '../_shared/payoutMethodSync.ts';

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get('userId');
    if (!userId) return json({ error: 'Missing userId' }, 400);

    const profile = await selectOne('profiles', `id=eq.${userId}`);
    if (!profile?.stripe_connect_account_id) {
      return json({ success: true, payoutMethod: null });
    }

    const safe = await syncPayoutMethodFromStripeAccount(userId, profile.stripe_connect_account_id);
    return json({ success: true, payoutMethod: safe });
  } catch (e) {
    console.error('payout-connect-status error:', e);
    return json({ error: 'Internal error' }, 500);
  }
});
