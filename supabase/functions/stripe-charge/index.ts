import { computeBreakdown } from '../_shared/pricing.ts';
import { coveredDates } from '../_shared/bookingDates.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  // Wildcard rather than an explicit list — some antivirus/corporate proxies
  // inject extra request headers (e.g. `x-connection-encrypted`) that
  // aren't in a fixed allow-list, which fails the CORS preflight before the
  // request is ever sent. Safe as '*' here since nothing on this endpoint
  // relies on credentialed (cookie-based) requests.
  'Access-Control-Allow-Headers': '*',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

async function dbInsert(table: string, row: Record<string, unknown>) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'apikey': SUPABASE_SERVICE_KEY,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(row),
  });
}

async function dbSelectOne(table: string, filter: string): Promise<any | null> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}&select=*&limit=1`, {
    headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, apikey: SUPABASE_SERVICE_KEY },
  });
  const rows = await res.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function dbUpsert(table: string, row: Record<string, unknown>, onConflict: string) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'apikey': SUPABASE_SERVICE_KEY,
      'Prefer': 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(row),
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const url = new URL(req.url);

  // ── GET /stripe-charge/verify?session_id=xxx ──────────────────
  // Called on return from Stripe to verify a cash order payment. The
  // caller (Checkout.tsx) finalizes its own order/transaction rows using
  // the cad_amount this returns — this endpoint only verifies with Stripe
  // and reports back the confirmed amount, idempotently.
  if (req.method === 'GET' && url.pathname.endsWith('/verify')) {
    const sessionId = url.searchParams.get('session_id');
    if (!sessionId) return new Response(JSON.stringify({ error: 'Missing session_id' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });

    const SK = Deno.env.get('STRIPE_SECRET_KEY');
    if (!SK) return new Response(JSON.stringify({ error: 'Stripe not configured' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });

    // Fetch session from Stripe
    const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
      headers: { 'Authorization': `Bearer ${SK}` },
    });
    const session = await res.json();

    if (session.error) return new Response(JSON.stringify({ error: session.error.message }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (session.payment_status !== 'paid') return new Response(JSON.stringify({ error: 'Payment not completed', status: session.payment_status }), { status: 402, headers: { ...cors, 'Content-Type': 'application/json' } });

    const userId = session.metadata?.user_id;
    const cadAmt = parseFloat(session.metadata?.cad_amount || '0');
    const breakdown = {
      subtotal:         parseFloat(session.metadata?.subtotal || '0'),
      buyer_fee_rate:   parseFloat(session.metadata?.buyer_fee_rate || '0'),
      buyer_fee_amount: parseFloat(session.metadata?.buyer_fee_amount || '0'),
      fee_config_version: session.metadata?.fee_config_version || null,
    };

    if (!userId) return new Response(JSON.stringify({ error: 'Missing metadata' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });

    // Check if already credited (idempotency)
    const checkRes = await fetch(`${SUPABASE_URL}/rest/v1/transactions?stripe_session_id=eq.${sessionId}&select=id`, {
      headers: { 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`, 'apikey': SUPABASE_SERVICE_KEY },
    });
    const existing = await checkRes.json();
    if (existing?.length > 0) {
      return new Response(JSON.stringify({ success: true, already_credited: true, cad_amount: cadAmt, ...breakdown }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, cad_amount: cadAmt, ...breakdown }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  // ── POST /stripe-charge — Create Checkout Session ─────────────
  try {
    const { subtotal, customer_email, description, success_url, cancel_url, user_id, host_id, rental_end_date, agreement_id, conversation_id, message_id } = await req.json();

    const SK = Deno.env.get('STRIPE_SECRET_KEY');
    if (!SK) return new Response(JSON.stringify({ error: 'Stripe not configured' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });

    // Availability check — before the customer is ever sent to Stripe, not
    // after. By stripe-webhook time the card has already been charged, so
    // that's too late to reject a booking; this is the only point in the
    // flow where "this date is already taken" can still mean "don't charge
    // them." fn_claim_booking_dates (called again, authoritatively, from
    // stripe-webhook on payment success) is the actual double-booking
    // guard against a second checkout started concurrently for the same
    // dates -- this pre-check is a fast, honest rejection for the much
    // more common case of a date that was already confirmed-booked before
    // this checkout even started.
    if (agreement_id) {
      const agreement = await dbSelectOne('rental_agreements', `id=eq.${agreement_id}`);
      const details = agreement?.rental_details_snapshot || {};
      const dates = coveredDates(details.startDate, details.duration, details.durationType);
      if (dates.length && agreement?.listing_id) {
        const inList = dates.map((d: string) => `"${d}"`).join(',');
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/listing_bookings?listing_id=eq.${encodeURIComponent(agreement.listing_id)}&status=eq.confirmed&booking_date=in.(${inList})&select=id&limit=1`,
          { headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, apikey: SUPABASE_SERVICE_KEY } },
        );
        const conflicts = await res.json();
        if (Array.isArray(conflicts) && conflicts.length > 0) {
          return new Response(JSON.stringify({ error: 'This date is no longer available. Please choose another date.' }), { status: 409, headers: { ...cors, 'Content-Type': 'application/json' } });
        }
      }
    }

    // The charge amount is never taken from the client — it's recomputed
    // here from the same shared calc checkout-quote used to show the
    // pre-payment breakdown, so what the renter saw and what they're
    // actually charged can never drift apart. This is the amount before any
    // Stripe-side adjustments — if Stripe Tax is enabled on this Stripe
    // account, Stripe applies it on top of what's sent here.
    const breakdown = await computeBreakdown({ subtotal });

    const params = new URLSearchParams({
      'mode':                                           'payment',
      'line_items[0][price_data][currency]':            'cad',
      'line_items[0][price_data][unit_amount]':         String(Math.round(breakdown.total * 100)),
      'line_items[0][price_data][product_data][name]':  description || 'Filmons Payment',
      'line_items[0][quantity]':                        '1',
      'success_url':                                    success_url,
      'cancel_url':                                     cancel_url,
      // Store metadata for verification — Stripe metadata values are capped
      // at 500 chars each, so the breakdown is spread across individual
      // string fields rather than one JSON blob.
      'metadata[user_id]':                              user_id || '',
      'metadata[host_id]':                              host_id || '',
      'metadata[cad_amount]':                           String(breakdown.total),
      'metadata[subtotal]':                             String(breakdown.subtotal),
      'metadata[buyer_fee_rate]':                        String(breakdown.buyerFeeRate),
      'metadata[buyer_fee_amount]':                      String(breakdown.buyerFeeAmount),
      'metadata[seller_fee_amount]':                     String(breakdown.sellerFeeAmount),
      'metadata[fee_config_version]':                    breakdown.feeConfigVersion,
      'metadata[rental_end_date]':                       rental_end_date || '',
      'metadata[agreement_id]':                          agreement_id || '',
      'metadata[conversation_id]':                       conversation_id || '',
      'metadata[message_id]':                            message_id || '',
      'metadata[platform]':                             'filmons',
    });

    if (customer_email?.includes('@')) params.set('customer_email', customer_email);

    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${SK}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });

    const session = await res.json();
    if (session.error) return new Response(JSON.stringify({ error: session.error.message }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });

    return new Response(JSON.stringify({ url: session.url, session_id: session.id }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});