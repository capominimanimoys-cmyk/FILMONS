// Generates a single-purpose, short-lived Stripe-hosted link for a host to
// resolve an outstanding identity-verification requirement (most commonly
// a government ID document) that this app deliberately doesn't build a
// custom upload UI for -- documents need Stripe's own secure hosted flow
// for compliance reasons, not a plain form field.
//
// This is NOT the old Express onboarding redirect (deleted earlier this
// session) reintroduced wholesale -- it only ever appears as a targeted
// "one more step" prompt on the Wallet page when a host's payout_methods
// row is already status='action_required', never as part of the normal
// setup flow, which stays fully in-app.
//
// Requires a stepUpToken minted by verify-identity, same gate as every
// other payout-method-touching function.
import { verifyStepUpToken } from '../_shared/stepUpAuth.ts';

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
    const { userId, stepUpToken, returnUrl, refreshUrl } = await req.json() as {
      userId?: string; stepUpToken?: string; returnUrl?: string; refreshUrl?: string;
    };
    if (!userId || !returnUrl || !refreshUrl) return json({ error: 'Missing required fields' }, 400);

    const validStepUp = await verifyStepUpToken(stepUpToken || '', userId, PURPOSE);
    if (!validStepUp) return json({ error: 'Please verify your identity again — this took too long.' }, 401);

    const profile = await selectOne('profiles', `id=eq.${userId}`);
    const accountId = profile?.stripe_connect_account_id as string | undefined;
    if (!accountId) return json({ error: 'Complete payout setup before verifying your identity' }, 400);

    const SK = Deno.env.get('STRIPE_SECRET_KEY');
    if (!SK) return json({ error: 'Stripe not configured' }, 500);

    const linkParams = new URLSearchParams({
      account: accountId, refresh_url: refreshUrl, return_url: returnUrl, type: 'account_onboarding',
    });
    const res = await fetch('https://api.stripe.com/v1/account_links', {
      method: 'POST',
      headers: { Authorization: `Bearer ${SK}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: linkParams,
    });
    const link = await res.json();
    if (link.error) return json({ error: link.error.message }, 400);

    return json({ url: link.url });
  } catch (e) {
    console.error('create-verification-link error:', e);
    return json({ error: 'Internal error' }, 500);
  }
});
