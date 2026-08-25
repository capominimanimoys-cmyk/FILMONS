// Starts (or resumes) Stripe Connect Express onboarding for a host's payout
// method. Requires a stepUpToken minted by verify-identity — this is the
// enforcement point for "Verify It's You must happen before the payout-
// method form is shown." Mirrors fund-opportunity's shape: raw REST to
// Stripe, no SDK, returns a URL for the client to redirect to.
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
    const { userId, stepUpToken, country, returnUrl, refreshUrl } = await req.json();
    if (!userId || !returnUrl || !refreshUrl) return json({ error: 'Missing required fields' }, 400);

    const validStepUp = await verifyStepUpToken(stepUpToken, userId, PURPOSE);
    if (!validStepUp) return json({ error: 'Please verify your identity again — this took too long.' }, 401);

    const profile = await selectOne('profiles', `id=eq.${userId}`);
    if (!profile) return json({ error: 'Account not found' }, 404);

    const SK = Deno.env.get('STRIPE_SECRET_KEY');
    if (!SK) return json({ error: 'Stripe not configured' }, 500);

    let accountId = profile.stripe_connect_account_id as string | null;

    if (!accountId) {
      // First-time setup — country is locked in now and reused for every
      // future "Change Payout Method" without asking again, per spec:
      // "Do not let the user manually choose a fake payout country that
      // conflicts with their connected account/legal setup."
      if (!country || !['CA', 'US'].includes(country)) {
        return json({ error: 'Country is required for first-time setup (CA or US)' }, 400);
      }
      // 'transfers' is what actually matters here — it's what lets Filmons
      // move money TO this connected account. card_payments is requested
      // alongside it purely because Stripe requires platform-level approval
      // (a manual request via Stripe support) to create accounts with
      // transfers alone and no card_payments — confirmed live: requesting
      // transfers-only returned "Your platform needs approval for accounts
      // to have requested the transfers capability without the
      // card_payments capability." Requesting both is Stripe's standard,
      // no-approval-needed combo; card_payments is never actually used
      // here (no connected account ever charges a card through Filmons),
      // it just needs to be flagged as requested. Whether a given debit
      // card can receive an INSTANT payout is a property of the external
      // account itself once added, not something requested here.
      const params = new URLSearchParams({
        type: 'express',
        country,
        email: profile.email || '',
        'capabilities[transfers][requested]': 'true',
        'capabilities[card_payments][requested]': 'true',
      });
      const res = await fetch('https://api.stripe.com/v1/accounts', {
        method: 'POST',
        headers: { Authorization: `Bearer ${SK}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params,
      });
      const account = await res.json();
      if (account.error) return json({ error: account.error.message }, 400);
      accountId = account.id;

      await fetch(rest(`/profiles?id=eq.${userId}`), {
        method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
        body: JSON.stringify({ stripe_connect_account_id: accountId, stripe_connect_country: country }),
      });
    }

    const linkParams = new URLSearchParams({
      account: accountId!,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    });
    const linkRes = await fetch('https://api.stripe.com/v1/account_links', {
      method: 'POST',
      headers: { Authorization: `Bearer ${SK}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: linkParams,
    });
    const link = await linkRes.json();
    if (link.error) return json({ error: link.error.message }, 400);

    return json({ url: link.url });
  } catch (e) {
    console.error('payout-connect-start error:', e);
    return json({ error: 'Internal error' }, 500);
  }
});
