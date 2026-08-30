// Admin-triggered refund — mirrors admin-process-payout's pattern. Calls
// Stripe's actual Refund API when the order has a captured payment_intent
// (card payments, via the stripe-webhook backfill); for cash-equivalent
// payment methods, there's no Stripe transaction to reverse, so this only
// does the ledger-side reversal (a manual/off-platform refund is the
// admin's own responsibility for those).
//
// Requires a verified admin token (X-Admin-Token) — see _shared/adminAuth.ts.
import { verifyAdminToken } from '../_shared/adminAuth.ts';

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

async function rpc(fn: string, args: Record<string, unknown>) {
  const res = await fetch(rest(`/rpc/${fn}`), { method: 'POST', headers: H, body: JSON.stringify(args) });
  if (!res.ok) throw new Error(`RPC ${fn} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  try {
    const admin = await verifyAdminToken(req);
    if (!admin) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    const adminName = admin.name;

    const { refundRequestId } = await req.json();
    if (!refundRequestId) {
      return new Response(JSON.stringify({ error: 'Missing refundRequestId' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const reqRow = await selectOne('refund_requests', `id=eq.${refundRequestId}`);
    if (!reqRow) return new Response(JSON.stringify({ error: 'Refund request not found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (reqRow.status !== 'requested' && reqRow.status !== 'approved') {
      return new Response(JSON.stringify({ error: `Refund request is already ${reqRow.status}` }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const order = await selectOne('orders', `id=eq.${reqRow.order_id}`);
    if (!order) return new Response(JSON.stringify({ error: 'Order not found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (order.refund_status === 'refunded') {
      return new Response(JSON.stringify({ error: 'Order already fully refunded' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    let stripeRefundId: string | null = null;
    if (order.stripe_payment_intent_id) {
      const SK = Deno.env.get('STRIPE_SECRET_KEY');
      if (!SK) return new Response(JSON.stringify({ error: 'Stripe not configured' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });

      const params = new URLSearchParams({
        payment_intent: order.stripe_payment_intent_id,
        amount: String(Math.round(Number(reqRow.amount) * 100)),
        reason: 'requested_by_customer',
      });
      const stripeRes = await fetch('https://api.stripe.com/v1/refunds', {
        method: 'POST',
        headers: { Authorization: `Bearer ${SK}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params,
      });
      const refund = await stripeRes.json();
      if (refund.error) {
        return new Response(JSON.stringify({ error: refund.error.message }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      stripeRefundId = refund.id;
    }
    // No payment_intent on file — cash-equivalent payment method. Ledger
    // reversal still happens below; there's no online charge to reverse.

    await rpc('fn_process_refund', {
      p_order_id: reqRow.order_id,
      p_amount: reqRow.amount,
      p_reason: reqRow.reason || null,
    });

    // A full refund is this app's only real "cancel a confirmed booking"
    // signal today (no separate cancel flow exists) -- release the dates
    // it held so another renter can book them. A partial refund is left
    // alone since the booking itself isn't necessarily being cancelled.
    if (Number(reqRow.amount) >= Number(order.total_amount)) {
      await rpc('fn_release_booking_dates', { p_order_id: reqRow.order_id }).catch(e =>
        console.error('fn_release_booking_dates failed for', reqRow.order_id, e));
    }

    await fetch(rest(`/refund_requests?id=eq.${refundRequestId}`), {
      method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'processed', processed_at: new Date().toISOString(), processed_by: adminName || 'Admin', stripe_refund_id: stripeRefundId }),
    });

    return new Response(JSON.stringify({ success: true, stripeRefundId }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('process-refund error:', e);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
