// Re-syncs payout_methods from the live Stripe account on demand -- the
// missing piece after the old Express-era payout-connect-status (deleted
// this session) used to do this right after a user returned from Stripe's
// hosted onboarding. Without it, payout_methods can be left pointing at
// a stale/dead stripe_connect_account_id (e.g. after setup-payout-account's
// reactive retry created a fresh account) until stripe-webhook's
// account.updated event happens to fire -- which never happens at all if a
// host finishes identity/bank collection entirely inside Stripe's hosted
// account_onboarding Account Link (create-verification-link), since that
// flow never calls submit-payout-bank-account.
//
// Called from the Wallet page on every mount -- cheap (one Stripe GET),
// idempotent, and self-healing: it fixes this exact class of drift
// automatically the next time a host loads their wallet, no manual DB
// fix-up needed.
import { isStaleAccountError } from '../_shared/stripeAccountErrors.ts';
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
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const { userId } = await req.json() as { userId?: string };
    if (!userId) return json({ error: 'Missing required fields' }, 400);

    const profile = await selectOne('profiles', `id=eq.${userId}`);
    const accountId = profile?.stripe_connect_account_id as string | undefined;
    if (!accountId) return json({ success: true, synced: false });

    try {
      await syncPayoutMethodFromStripeAccount(userId, accountId);
      return json({ success: true, synced: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (isStaleAccountError(message)) {
        await fetch(rest(`/profiles?id=eq.${userId}`), {
          method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
          body: JSON.stringify({ stripe_connect_account_id: null, stripe_connect_country: null, payout_account_type: null }),
        });
        return json({ success: true, synced: false, staleAccount: true });
      }
      console.error('sync-payout-method-status: sync failed:', message);
      return json({ success: true, synced: false });
    }
  } catch (e) {
    console.error('sync-payout-method-status error:', e);
    return json({ error: 'Internal error' }, 500);
  }
});
