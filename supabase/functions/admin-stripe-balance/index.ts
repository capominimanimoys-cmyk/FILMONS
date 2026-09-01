// Admin-only: fetches FILMONS' live Stripe balance (GET /v1/balance) so
// the Wallet page can compare it against this app's own summed wallet
// balances and surface a discrepancy instead of silently trusting one
// side. Requires the Stripe secret key server-side -- the browser can
// never call this directly, hence a dedicated function instead of a
// client-side fetch.
import { verifyAdminToken } from '../_shared/adminAuth.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') || '';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const admin = await verifyAdminToken(req);
  if (!admin) return json({ error: 'Unauthorized' }, 401);

  if (!STRIPE_SECRET_KEY) {
    console.error('admin-stripe-balance: STRIPE_SECRET_KEY not configured');
    return json({ error: 'Server misconfigured' }, 500);
  }

  try {
    const res = await fetch('https://api.stripe.com/v1/balance', {
      headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('admin-stripe-balance: Stripe API error', res.status, data);
      return json({ error: data?.error?.message || 'Stripe request failed' }, 502);
    }

    // Stripe splits balance by currency; this app only ever deals in
    // CAD (see wallets.currency default and every order insert site),
    // so sum whichever CAD entries exist rather than assuming index 0.
    const sumCad = (entries: Array<{ amount: number; currency: string }> | undefined) =>
      (entries || []).filter(e => e.currency === 'cad').reduce((s, e) => s + e.amount, 0) / 100;

    return json({
      available: sumCad(data.available),
      pending: sumCad(data.pending),
      currency: 'CAD',
      fetchedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error('admin-stripe-balance error:', e);
    return json({ error: 'Internal error' }, 500);
  }
});
