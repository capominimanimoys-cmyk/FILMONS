// Creates the Stripe Checkout Session that funds a paid Opportunity hire —
// mirrors stripe-charge/boost-charge/subscription-charge's shape exactly
// (raw REST to Stripe, no SDK). Never gives the worker withdrawable money
// on its own — activation only ever happens in stripe-webhook once Stripe
// confirms payment, which then calls fn_finalize_opportunity_payment.
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
  const url = new URL(req.url);

  // GET /fund-opportunity/verify?session_id=xxx — UI confirmation only,
  // same "webhook confirms truth" split as every other charge function.
  if (req.method === 'GET' && url.pathname.endsWith('/verify')) {
    const sessionId = url.searchParams.get('session_id');
    if (!sessionId) return json({ error: 'Missing session_id' }, 400);
    const SK = Deno.env.get('STRIPE_SECRET_KEY');
    if (!SK) return json({ error: 'Stripe not configured' }, 500);
    const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, { headers: { Authorization: `Bearer ${SK}` } });
    const session = await res.json();
    if (session.error) return json({ error: session.error.message }, 400);
    if (session.payment_status !== 'paid') return json({ error: 'Payment not completed', status: session.payment_status }, 402);
    const applicationId = session.metadata?.application_id;
    const app = applicationId ? await selectOne('opportunity_applications', `id=eq.${applicationId}`) : null;
    return json({ success: true, funded: app?.status === 'hired', application: app });
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const { userId, applicationId, successUrl, cancelUrl } = await req.json();
    if (!userId || !applicationId || !successUrl || !cancelUrl) return json({ error: 'Missing required fields' }, 400);

    const app = await selectOne('opportunity_applications', `id=eq.${applicationId}`);
    if (!app) return json({ error: 'Application not found' }, 404);
    const listing = await selectOne('listings', `id=eq.${encodeURIComponent(app.listing_id)}`);
    if (!listing || listing.user_id !== userId) return json({ error: 'You do not own this opportunity' }, 403);
    if (app.status !== 'offer_accepted') return json({ error: 'This offer has not been accepted yet' }, 400);

    const txn = await selectOne('opportunity_transactions', `application_id=eq.${applicationId}`);
    if (!txn || txn.payment_status !== 'pending') return json({ error: 'No pending offer to fund' }, 400);

    const SK = Deno.env.get('STRIPE_SECRET_KEY');
    if (!SK) return json({ error: 'Stripe not configured' }, 500);

    const configRow = await selectOne('opportunity_payment_config', 'id=eq.1');
    const holdReviewDays = configRow?.hold_review_days ?? 7;

    const params = new URLSearchParams({
      mode: 'payment',
      'line_items[0][price_data][currency]': (txn.currency || 'CAD').toLowerCase(),
      'line_items[0][price_data][product_data][name]': `Opportunity payment — ${listing.title || 'Opportunity'}`,
      'line_items[0][price_data][unit_amount]': String(Math.round(Number(txn.gross_amount) * 100)),
      'line_items[0][quantity]': '1',
      success_url: successUrl,
      cancel_url: cancelUrl,
      'metadata[charge_type]': 'opportunity',
      'metadata[transaction_id]': txn.id,
      'metadata[application_id]': applicationId,
      'metadata[owner_id]': userId,
      'metadata[worker_id]': app.applicant_id,
      'metadata[gross_amount]': String(txn.gross_amount),
      'metadata[fee_amount]': String(txn.fee_amount),
      'metadata[net_amount]': String(txn.net_amount),
      'metadata[hold_review_days]': String(holdReviewDays),
      'metadata[listing_id]': app.listing_id,
      'metadata[listing_title]': listing.title || '',
      'metadata[platform]': 'filmons',
    });

    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${SK}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    const session = await res.json();
    if (session.error) return json({ error: session.error.message }, 400);

    await fetch(rest(`/opportunity_applications?id=eq.${applicationId}`), {
      method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'payment_pending' }),
    });
    await fetch(rest(`/opportunity_transactions?id=eq.${txn.id}`), {
      method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({ stripe_checkout_session_id: session.id, updated_at: new Date().toISOString() }),
    });

    return json({ url: session.url, session_id: session.id });
  } catch (e) {
    console.error('fund-opportunity error:', e);
    return json({ error: 'Internal error' }, 500);
  }
});
