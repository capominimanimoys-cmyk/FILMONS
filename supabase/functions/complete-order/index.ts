// The host marks a rental / service finished. If the renter paid a refundable
// security deposit (held on the order since checkout, never credited to the
// host), it is refunded to the renter's card here -- the only place a held
// deposit is ever released.
//
// Auth: the caller's Supabase JWT; only the order's host may complete it.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY };
const rest = (p: string) => `${SUPABASE_URL}/rest/v1${p}`;
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

async function selectOne(table: string, filter: string) {
  const res = await fetch(rest(`/${table}?${filter}&select=*&limit=1`), { headers: H });
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer /i, '');
    const userRes = token ? await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: SERVICE_KEY } }) : null;
    const caller = userRes?.ok ? await userRes.json() : null;
    if (!caller?.id) return json({ error: 'Please sign in again.' }, 401);

    const { orderId, condition } = await req.json();
    if (!orderId) return json({ error: 'Missing orderId' }, 400);

    const order = await selectOne('orders', `id=eq.${encodeURIComponent(orderId)}`);
    if (!order) return json({ error: 'Order not found' }, 404);
    // Rentals are finished by the host (after checking the equipment); services by the customer (after the provider submits the work).
    const isService = order.type === 'service';
    if (isService) {
      if (order.renter_id !== caller.id) return json({ error: 'Only the customer can confirm the service is finished.' }, 403);
      if (!order.work_submitted_at) return json({ error: 'The provider has not submitted the work yet.' }, 400);
    } else if (order.host_id !== caller.id) {
      return json({ error: 'Only the host can mark this rental finished.' }, 403);
    }
    if (order.refund_status === 'refunded') return json({ error: 'This order was fully refunded.' }, 400);

    const deposit = Number(order.deposit_amount) || 0;
    let depositReleased = order.deposit_status === 'released';
    let refundId: string | null = order.stripe_deposit_refund_id || null;

    if (deposit > 0 && (order.deposit_status === 'held' || order.deposit_status === 'releasing')) {
      // An open dispute keeps the deposit held until it is resolved.
      if (order.dispute_status === 'disputed') return json({ error: 'This order is under dispute. The deposit stays held until it is resolved.' }, 409);
      if (!order.stripe_payment_intent_id) return json({ error: 'No card payment found for this deposit. Contact support.' }, 400);
      const SK = Deno.env.get('STRIPE_SECRET_KEY');
      if (!SK) return json({ error: 'Stripe not configured' }, 500);

      // Mark it 'releasing' first; the Stripe Idempotency-Key below means a double tap or a retry after a crash can never refund twice.
      const claim = await fetch(rest(`/orders?id=eq.${encodeURIComponent(orderId)}&deposit_status=in.(held,releasing)`), {
        method: 'PATCH', headers: { ...H, Prefer: 'return=representation' },
        body: JSON.stringify({ deposit_status: 'releasing' }),
      });
      const claimed = await claim.json().catch(() => []);
      if (Array.isArray(claimed) && claimed.length) {
        const stripeRes = await fetch('https://api.stripe.com/v1/refunds', {
          method: 'POST',
          headers: { Authorization: `Bearer ${SK}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': `deposit_${orderId}` },
          body: new URLSearchParams({
            payment_intent: order.stripe_payment_intent_id,
            amount: String(Math.round(deposit * 100)),
            reason: 'requested_by_customer',
            'metadata[order_id]': orderId, 'metadata[kind]': 'deposit_release',
          }),
        });
        const refund = await stripeRes.json();
        if (refund.error) {
          await fetch(rest(`/orders?id=eq.${encodeURIComponent(orderId)}`), { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ deposit_status: 'held' }) });
          return json({ error: refund.error.message || 'Could not release the deposit. Try again.' }, 400);
        }
        refundId = refund.id;
        depositReleased = true;
        await fetch(rest(`/orders?id=eq.${encodeURIComponent(orderId)}`), {
          method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
          body: JSON.stringify({ deposit_status: 'released', deposit_released_at: new Date().toISOString(), stripe_deposit_refund_id: refundId }),
        });
      }
    }

    if (!order.completed_at) {
      await fetch(rest(`/orders?id=eq.${encodeURIComponent(orderId)}`), {
        method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
        body: JSON.stringify({ completed_at: new Date().toISOString(), completed_by: caller.id, ...(!isService && typeof condition === 'string' && condition.trim() ? { return_condition: condition.trim().slice(0, 1000) } : {}) }),
      });
      const kind = isService ? 'service' : 'rental';
      await fetch(rest('/notifications'), {
        method: 'POST', headers: { ...H, Prefer: 'return=minimal' },
        body: JSON.stringify({
          user_id: isService ? order.host_id : order.renter_id, actor_id: null, actor_name: 'Filmons', type: 'system_notification', is_read: false,
          conversation_id: order.conversation_id || null,
          title: `Your ${kind} of ${order.listing_title || 'this booking'} was marked finished` + (depositReleased && deposit > 0 ? ` — your $${deposit.toFixed(2)} deposit is on its way back to your card (5–10 business days).` : '.'),
        }),
      }).catch(() => {});
    }

    return json({ success: true, depositReleased, depositAmount: deposit });
  } catch (e) {
    console.error('complete-order error:', e);
    return json({ error: 'Internal error' }, 500);
  }
});
