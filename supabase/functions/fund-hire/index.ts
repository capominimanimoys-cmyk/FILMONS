// Creates the Stripe Checkout Session that funds an accepted Hire Request —
// mirrors fund-opportunity's shape exactly (raw REST to Stripe, no SDK).
// Never gives the host withdrawable money on its own — activation only
// ever happens in stripe-webhook once Stripe confirms payment, which then
// calls fn_finalize_hire_payment.
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
  const url = new URL(req.url);

  // GET /fund-hire/verify?session_id=xxx — UI confirmation only, same
  // "webhook confirms truth" split as every other charge function.
  if (req.method === 'GET' && url.pathname.endsWith('/verify')) {
    const sessionId = url.searchParams.get('session_id');
    if (!sessionId) return json({ error: 'Missing session_id' }, 400);
    const SK = Deno.env.get('STRIPE_SECRET_KEY');
    if (!SK) return json({ error: 'Stripe not configured' }, 500);
    const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, { headers: { Authorization: `Bearer ${SK}` } });
    const session = await res.json();
    if (session.error) return json({ error: session.error.message }, 400);
    if (session.payment_status !== 'paid') return json({ error: 'Payment not completed', status: session.payment_status }, 402);
    const hireRequestId = session.metadata?.hire_request_id;
    const hr = hireRequestId ? await selectOne('hire_requests', `id=eq.${hireRequestId}`) : null;
    return json({ success: true, funded: hr?.status === 'hired', hireRequest: hr });
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const { userId, hireRequestId, successUrl, cancelUrl } = await req.json();
    if (!userId || !hireRequestId || !successUrl || !cancelUrl) return json({ error: 'Missing required fields' }, 400);

    const hr = await selectOne('hire_requests', `id=eq.${hireRequestId}`);
    if (!hr) return json({ error: 'Hire request not found' }, 404);
    if (hr.requester_id !== userId) return json({ error: 'You do not own this hire request' }, 403);
    // payment_pending is included so an abandoned/expired Stripe Checkout
    // session can be retried instead of being a dead end — same fix as
    // fund-opportunity. The transaction row's own payment_status is still
    // the real guard against re-funding something already paid.
    if (!['accepted', 'payment_pending'].includes(hr.status)) return json({ error: 'Terms have not been agreed yet' }, 400);

    const txn = await selectOne('hire_transactions', `hire_request_id=eq.${hireRequestId}`);
    if (!txn || txn.payment_status !== 'pending') return json({ error: 'No pending hire payment to fund' }, 400);

    const SK = Deno.env.get('STRIPE_SECRET_KEY');
    if (!SK) return json({ error: 'Stripe not configured' }, 500);

    const configRow = await selectOne('opportunity_payment_config', 'id=eq.1');
    const holdReviewDays = configRow?.hold_review_days ?? 7;

    const params = new URLSearchParams({
      mode: 'payment',
      'line_items[0][price_data][currency]': (txn.currency || 'CAD').toLowerCase(),
      'line_items[0][price_data][product_data][name]': `Hire payment — ${hr.project_title || 'Filmons Hire'}`,
      'line_items[0][price_data][unit_amount]': String(Math.round(Number(txn.gross_amount) * 100)),
      'line_items[0][quantity]': '1',
      success_url: successUrl,
      cancel_url: cancelUrl,
      'metadata[charge_type]': 'hire',
      'metadata[transaction_id]': txn.id,
      'metadata[hire_request_id]': hireRequestId,
      'metadata[requester_id]': userId,
      'metadata[host_id]': hr.host_id,
      'metadata[gross_amount]': String(txn.gross_amount),
      'metadata[fee_amount]': String(txn.fee_amount),
      'metadata[net_amount]': String(txn.net_amount),
      'metadata[hold_review_days]': String(holdReviewDays),
      'metadata[project_title]': hr.project_title || '',
      'metadata[conversation_id]': hr.conversation_id || '',
      'metadata[platform]': 'filmons',
    });

    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${SK}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    const session = await res.json();
    if (session.error) return json({ error: session.error.message }, 400);

    await fetch(rest(`/hire_requests?id=eq.${hireRequestId}`), {
      method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'payment_pending', updated_at: new Date().toISOString() }),
    });
    await fetch(rest(`/hire_transactions?id=eq.${txn.id}`), {
      method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({ stripe_checkout_session_id: session.id, updated_at: new Date().toISOString() }),
    });

    return json({ url: session.url, session_id: session.id });
  } catch (e) {
    console.error('fund-hire error:', e);
    return json({ error: 'Internal error' }, 500);
  }
});
