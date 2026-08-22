// Cancels a Professional/Business subscription at the END of the current
// billing period — access/limits stay at the current plan until Stripe
// actually ends it, at which point stripe-webhook's customer.subscription.deleted
// handler calls fn_deactivate_subscription. Never downgrades immediately.
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const { userId } = await req.json();
    if (!userId) return json({ error: 'Missing userId' }, 400);

    const profile = await selectOne('profiles', `id=eq.${userId}`);
    if (!profile) return json({ error: 'Profile not found' }, 404);
    if (!profile.stripe_subscription_id || profile.subscription_status !== 'active') {
      return json({ error: 'No active subscription to cancel' }, 400);
    }

    const SK = Deno.env.get('STRIPE_SECRET_KEY');
    if (!SK) return json({ error: 'Stripe not configured' }, 500);

    const res = await fetch(`https://api.stripe.com/v1/subscriptions/${profile.stripe_subscription_id}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SK}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ cancel_at_period_end: 'true' }),
    });
    const sub = await res.json();
    if (sub.error) return json({ error: sub.error.message }, 400);

    await fetch(rest(`/profiles?id=eq.${userId}`), {
      method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({ subscription_cancel_at_period_end: true }),
    });

    return json({ success: true });
  } catch (e) {
    console.error('cancel-subscription error:', e);
    return json({ error: 'Internal error' }, 500);
  }
});
