// Creates the Stripe Checkout Session for a paid Emergency Listing upgrade
// (72-hour $4.99 or 7-day $9.99, both CAD) -- fixed-tier pricing, unlike
// boost-charge's variable daily-budget model, so this is its own function
// rather than a mode of that one. Same "webhook confirms truth" split:
// this only ever creates a pending_payment draft row + Checkout Session;
// stripe-webhook's metadata[charge_type] === 'emergency' branch is what
// actually activates Emergency status via fn_finalize_emergency_payment.
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
function rest(path: string) { return `${SUPABASE_URL}/rest/v1${path}`; }
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY };

async function selectOne(table: string, filter: string) {
  const res = await fetch(rest(`/${table}?${filter}&select=*&limit=1`), { headers: H });
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] : null;
}

// The ONE source of truth for Emergency pricing -- never trusted from the
// client, which only ever sends which plan it wants, never an amount.
const PLAN_PRICING: Record<string, { amountCad: number; label: string }> = {
  '72_hour': { amountCad: 4.99, label: '72-Hour Emergency' },
  '7_day':   { amountCad: 9.99, label: '7-Day Emergency' },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const url = new URL(req.url);

  // ── GET /emergency-charge/verify?session_id=xxx ── UI confirmation only,
  // same role as boost-charge's /verify. ────────────────────────────────
  if (req.method === 'GET' && url.pathname.endsWith('/verify')) {
    const sessionId = url.searchParams.get('session_id');
    if (!sessionId) return json({ error: 'Missing session_id' }, 400);

    const SK = Deno.env.get('STRIPE_SECRET_KEY');
    if (!SK) return json({ error: 'Stripe not configured' }, 500);

    const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
      headers: { Authorization: `Bearer ${SK}` },
    });
    const session = await res.json();
    if (session.error) return json({ error: session.error.message }, 400);
    if (session.payment_status !== 'paid') return json({ error: 'Payment not completed', status: session.payment_status }, 402);

    const emergencyId = session.metadata?.emergency_id;
    if (!emergencyId) return json({ error: 'Missing metadata' }, 400);

    const emergency = await selectOne('listing_emergencies', `id=eq.${emergencyId}`);
    return json({ success: true, emergency });
  }

  // ── POST /emergency-charge — validate, create draft row, create Checkout Session ──
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const { listingId, ownerId, plan, success_url, cancel_url } = await req.json();
    if (!listingId || !ownerId || !plan || !success_url || !cancel_url) {
      return json({ error: 'Missing required fields' }, 400);
    }
    const pricing = PLAN_PRICING[plan];
    if (!pricing) return json({ error: 'Invalid plan' }, 400);

    const SK = Deno.env.get('STRIPE_SECRET_KEY');
    if (!SK) return json({ error: 'Stripe not configured' }, 500);

    // Ownership verified server-side against the listing's real user_id --
    // same trust model as boost-charge/delete-listing, never trusted from
    // the client's ownerId claim alone.
    const listing = await selectOne('listings', `id=eq.${listingId}`);
    if (!listing) return json({ error: 'Listing not found' }, 404);
    if (listing.user_id !== ownerId) return json({ error: 'You do not own this listing' }, 403);
    if (listing.is_active === false) return json({ error: 'Listing is not active' }, 409);

    const insertRes = await fetch(rest('/listing_emergencies'), {
      method: 'POST',
      headers: { ...H, Prefer: 'return=representation' },
      body: JSON.stringify({
        listing_id: listingId, owner_id: ownerId, plan,
        amount: pricing.amountCad, currency: 'CAD', status: 'pending_payment',
      }),
    });
    const inserted = await insertRes.json();
    const emergencyRow = Array.isArray(inserted) ? inserted[0] : inserted;
    if (!emergencyRow?.id) return json({ error: 'Could not create emergency upgrade' }, 500);

    const params = new URLSearchParams({
      'mode': 'payment',
      'line_items[0][price_data][currency]': 'cad',
      'line_items[0][price_data][unit_amount]': String(Math.round(pricing.amountCad * 100)),
      'line_items[0][price_data][product_data][name]': `${pricing.label} — ${listing.title || 'Listing'}`,
      'line_items[0][quantity]': '1',
      'success_url': success_url,
      'cancel_url': cancel_url,
      'metadata[charge_type]': 'emergency',
      'metadata[emergency_id]': emergencyRow.id,
      'metadata[listing_id]': listingId,
      'metadata[owner_id]': ownerId,
      'metadata[plan]': plan,
      'metadata[amount]': String(pricing.amountCad),
      'metadata[platform]': 'filmons',
    });

    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${SK}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    const session = await res.json();
    if (session.error) {
      await fetch(rest(`/listing_emergencies?id=eq.${emergencyRow.id}`), {
        method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'failed', emergency_payment_status: 'failed', updated_at: new Date().toISOString() }),
      });
      return json({ error: session.error.message }, 400);
    }

    await fetch(rest(`/listing_emergencies?id=eq.${emergencyRow.id}`), {
      method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({ emergency_payment_id: session.id, updated_at: new Date().toISOString() }),
    });

    return json({ url: session.url, session_id: session.id, emergency_id: emergencyRow.id, amount: pricing.amountCad });
  } catch (err) {
    console.error('emergency-charge error:', err);
    return json({ error: String(err) }, 500);
  }
});
