// Creates a Stripe Checkout Session for a Professional/Business monthly
// subscription — mirrors boost-charge's shape (raw REST calls to Stripe,
// no SDK, same as every other charge function in this app). Prices are
// created ad-hoc via price_data with a recurring interval (no pre-created
// Stripe Price objects needed), same inline-pricing approach boost-charge
// already uses for one-time charges. Activation is never frontend-driven —
// stripe-webhook's checkout.session.completed handler is the only thing
// that ever calls fn_activate_subscription, after Stripe itself confirms
// payment.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
};
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

import { ENTITLEMENTS } from '../_shared/entitlements.ts';

const PLAN_LABEL: Record<string, string> = { professional: 'Professional', business: 'Business' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = new URL(req.url);

  // GET /subscription-charge/verify?session_id=xxx — UI confirmation only,
  // same "webhook confirms truth" split as boost-charge/stripe-charge.
  if (req.method === 'GET' && url.pathname.endsWith('/verify')) {
    const sessionId = url.searchParams.get('session_id');
    if (!sessionId) return json({ error: 'Missing session_id' }, 400);
    const SK = Deno.env.get('STRIPE_SECRET_KEY');
    if (!SK) return json({ error: 'Stripe not configured' }, 500);

    const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, { headers: { Authorization: `Bearer ${SK}` } });
    const session = await res.json();
    if (session.error) return json({ error: session.error.message }, 400);
    if (session.payment_status !== 'paid' && session.status !== 'complete') return json({ error: 'Payment not completed', status: session.status }, 402);

    const userId = session.metadata?.user_id;
    const plan = session.metadata?.plan;
    if (!userId) return json({ error: 'Missing metadata' }, 400);
    const profile = await selectOne('profiles', `id=eq.${userId}`);
    return json({ success: true, activated: profile?.account_type === plan, profile });
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const { userId, plan, successUrl, cancelUrl } = await req.json();
    if (!userId || !plan || !successUrl || !cancelUrl) return json({ error: 'Missing required fields' }, 400);
    const entitlement = (ENTITLEMENTS as Record<string, { priceCents: number }>)[plan];
    if (!entitlement || !entitlement.priceCents) return json({ error: 'Invalid plan' }, 400);

    const SK = Deno.env.get('STRIPE_SECRET_KEY');
    if (!SK) return json({ error: 'Stripe not configured' }, 500);

    const profile = await selectOne('profiles', `id=eq.${userId}`);
    if (!profile) return json({ error: 'Profile not found' }, 404);

    const params = new URLSearchParams({
      mode: 'subscription',
      'line_items[0][price_data][currency]': 'cad',
      'line_items[0][price_data][product_data][name]': `Filmons ${PLAN_LABEL[plan] || plan}`,
      'line_items[0][price_data][recurring][interval]': 'month',
      'line_items[0][price_data][unit_amount]': String(entitlement.priceCents),
      'line_items[0][quantity]': '1',
      success_url: successUrl,
      cancel_url: cancelUrl,
      'metadata[charge_type]': 'subscription',
      'metadata[user_id]': userId,
      'metadata[plan]': plan,
      'metadata[platform]': 'filmons',
    });
    // Reuse the same Stripe customer across subscriptions rather than
    // creating a duplicate one each time.
    if (profile.stripe_customer_id) params.set('customer', profile.stripe_customer_id);
    else if (profile.email) params.set('customer_email', profile.email);
    // Switching plans (e.g. Professional -> Business) — the webhook cancels
    // this old subscription once the new one activates, so the user is
    // never left with two simultaneous active subscriptions.
    if (profile.stripe_subscription_id && profile.subscription_status === 'active') {
      params.set('metadata[previous_subscription_id]', profile.stripe_subscription_id);
    }

    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${SK}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    const session = await res.json();
    if (session.error) return json({ error: session.error.message }, 400);

    return json({ url: session.url, session_id: session.id });
  } catch (e) {
    console.error('subscription-charge error:', e);
    return json({ error: 'Internal error' }, 500);
  }
});
