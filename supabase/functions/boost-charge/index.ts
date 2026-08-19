// Creates the Stripe Checkout Session for a paid listing boost. This is a
// separate charge type from stripe-charge's rental payments — boost spend
// is pure Filmons ad revenue, never passed through the 8% buyer/seller
// rental fee engine in _shared/pricing.ts. stripe-webhook branches on
// metadata[charge_type] === 'boost' to route the payment confirmation to
// fn_finalize_boost_payment instead of fn_finalize_payment.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

function rest(path: string) {
  return `${SUPABASE_URL}/rest/v1${path}`;
}
const H = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${SERVICE_KEY}`,
  apikey: SERVICE_KEY,
};

async function selectOne(table: string, filter: string) {
  const res = await fetch(rest(`/${table}?${filter}&select=*&limit=1`), { headers: H });
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const url = new URL(req.url);

  // ── GET /boost-charge/verify?session_id=xxx ────────────────────
  // Mirrors stripe-charge's /verify — UI confirmation only. The
  // authoritative activation happens in stripe-webhook via
  // fn_finalize_boost_payment, same "webhook confirms truth" split as
  // rental payments.
  if (req.method === 'GET' && url.pathname.endsWith('/verify')) {
    const sessionId = url.searchParams.get('session_id');
    if (!sessionId) return new Response(JSON.stringify({ error: 'Missing session_id' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });

    const SK = Deno.env.get('STRIPE_SECRET_KEY');
    if (!SK) return new Response(JSON.stringify({ error: 'Stripe not configured' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });

    const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
      headers: { 'Authorization': `Bearer ${SK}` },
    });
    const session = await res.json();
    if (session.error) return new Response(JSON.stringify({ error: session.error.message }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (session.payment_status !== 'paid') return new Response(JSON.stringify({ error: 'Payment not completed', status: session.payment_status }), { status: 402, headers: { ...cors, 'Content-Type': 'application/json' } });

    const boostId = session.metadata?.boost_id;
    if (!boostId) return new Response(JSON.stringify({ error: 'Missing metadata' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });

    const boost = await selectOne('listing_boosts', `id=eq.${boostId}`);
    return new Response(JSON.stringify({ success: true, boost }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  // ── POST /boost-charge — validate, create draft row, create Checkout Session ──
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  try {
    const {
      listingId, ownerId, goal, audienceType, audienceConfig,
      dailyBudget, durationDays, success_url, cancel_url,
    } = await req.json();

    if (!listingId || !ownerId || !goal || !audienceType || !dailyBudget || !durationDays) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const SK = Deno.env.get('STRIPE_SECRET_KEY');
    if (!SK) return new Response(JSON.stringify({ error: 'Stripe not configured' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });

    // Ownership + eligibility — client-asserted ownerId, server-verified
    // against the listing's real user_id column (same trust model as
    // delete-listing).
    const listing = await selectOne('listings', `id=eq.${listingId}`);
    if (!listing) return new Response(JSON.stringify({ error: 'Listing not found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (listing.user_id !== ownerId) {
      return new Response(JSON.stringify({ error: 'You do not own this listing' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    if (listing.is_active === false) {
      return new Response(JSON.stringify({ error: 'Listing is not active' }), { status: 409, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // Budget/duration bounds are never trusted from the client — re-clamp
    // against the live admin-configurable boost_config row.
    const config = (await selectOne('boost_config', 'id=eq.1')) || {
      min_daily_budget: 5, max_daily_budget: 100, min_duration_days: 1, max_duration_days: 30, currency: 'CAD',
    };
    const clampedDaily = Math.min(Math.max(Number(dailyBudget), config.min_daily_budget), config.max_daily_budget);
    const clampedDays = Math.min(Math.max(Math.round(Number(durationDays)), config.min_duration_days), config.max_duration_days);
    const totalBudget = Math.round(clampedDaily * clampedDays * 100) / 100;

    // Create the draft/pending_payment listing_boosts row up front so the
    // webhook has something to activate by id.
    const insertRes = await fetch(rest('/listing_boosts'), {
      method: 'POST',
      headers: { ...H, Prefer: 'return=representation' },
      body: JSON.stringify({
        listing_id: listingId,
        owner_id: ownerId,
        goal,
        audience_type: audienceType,
        audience_config: audienceConfig || {},
        daily_budget: clampedDaily,
        total_budget: totalBudget,
        currency: config.currency || 'CAD',
        duration_days: clampedDays,
        status: 'pending_payment',
      }),
    });
    const inserted = await insertRes.json();
    const boostRow = Array.isArray(inserted) ? inserted[0] : inserted;
    if (!boostRow?.id) {
      return new Response(JSON.stringify({ error: 'Could not create boost' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const params = new URLSearchParams({
      'mode':                                          'payment',
      'line_items[0][price_data][currency]':           (config.currency || 'CAD').toLowerCase(),
      'line_items[0][price_data][unit_amount]':        String(Math.round(totalBudget * 100)),
      'line_items[0][price_data][product_data][name]': `Boost Listing — ${listing.title || 'Listing'} (${clampedDays} day${clampedDays === 1 ? '' : 's'})`,
      'line_items[0][quantity]':                       '1',
      'success_url':                                   success_url,
      'cancel_url':                                     cancel_url,
      'metadata[charge_type]':                         'boost',
      'metadata[boost_id]':                             boostRow.id,
      'metadata[listing_id]':                           listingId,
      'metadata[owner_id]':                             ownerId,
      'metadata[total_budget]':                         String(totalBudget),
      'metadata[platform]':                             'filmons',
    });

    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${SK}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    const session = await res.json();
    if (session.error) {
      // Roll the draft row back to failed rather than leaving it stuck pending_payment.
      await fetch(rest(`/listing_boosts?id=eq.${boostRow.id}`), {
        method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'failed', updated_at: new Date().toISOString() }),
      });
      return new Response(JSON.stringify({ error: session.error.message }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    await fetch(rest(`/listing_boosts?id=eq.${boostRow.id}`), {
      method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({ stripe_session_id: session.id, updated_at: new Date().toISOString() }),
    });

    return new Response(JSON.stringify({ url: session.url, session_id: session.id, boost_id: boostRow.id, total_budget: totalBudget }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('boost-charge error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
