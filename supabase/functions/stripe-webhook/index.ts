// Authoritative, server-pushed payment confirmation. This — not the
// browser calling back to stripe-charge/verify after the redirect — is
// the only trusted trigger for crediting the host/Filmons wallets. A
// closed tab before the redirect completes previously meant Stripe was
// paid but nothing got recorded on our side; this closes that gap, and
// Stripe's own redelivery-on-failure guarantee means we must also be
// idempotent (handled by fn_finalize_payment's idempotency-key insert).
//
// Requires STRIPE_WEBHOOK_SECRET (from the Stripe dashboard's webhook
// endpoint settings) and STRIPE_SECRET_KEY (already configured for
// stripe-charge) as environment variables.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') || '';

async function verifyStripeSignature(payload: string, header: string, secret: string): Promise<boolean> {
  const parts = Object.fromEntries(header.split(',').map(p => p.split('=')));
  const timestamp = parts['t'];
  const sig = parts['v1'];
  if (!timestamp || !sig) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sigBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const expected = Array.from(new Uint8Array(sigBytes)).map(b => b.toString(16).padStart(2, '0')).join('');

  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

async function rpc(fn: string, args: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`RPC ${fn} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
  if (!WEBHOOK_SECRET) {
    console.error('STRIPE_WEBHOOK_SECRET not configured');
    return new Response(JSON.stringify({ error: 'Webhook not configured' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  const payload = await req.text();
  const sigHeader = req.headers.get('stripe-signature') || '';
  const valid = await verifyStripeSignature(payload, sigHeader, WEBHOOK_SECRET);
  if (!valid) {
    return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  try {
    const event = JSON.parse(payload);

    if (event.type !== 'checkout.session.completed') {
      // Acknowledge everything else — Stripe retries on non-2xx.
      return new Response(JSON.stringify({ received: true, ignored: event.type }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const session = event.data?.object;
    const meta = session?.metadata || {};
    const hostId = meta.host_id;
    const subtotal = parseFloat(meta.subtotal || '0');
    const buyerFeeAmount = parseFloat(meta.buyer_fee_amount || '0');
    const sellerFeeAmount = parseFloat(meta.seller_fee_amount || '0');

    if (!hostId || !subtotal) {
      // Not a rental/marketplace payment (or missing metadata) — nothing
      // to credit. Acknowledge so Stripe doesn't keep retrying.
      return new Response(JSON.stringify({ received: true, skipped: 'no host_id/subtotal' }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const availableAt = meta.rental_end_date
      ? new Date(new Date(meta.rental_end_date).getTime() + 48 * 3600 * 1000).toISOString()
      : new Date(Date.now() + 48 * 3600 * 1000).toISOString();

    const processed = await rpc('fn_finalize_payment', {
      p_idempotency_key: event.id,
      p_order_id: session.id,
      p_host_id: hostId,
      p_subtotal: subtotal,
      p_seller_fee_amount: sellerFeeAmount,
      p_buyer_fee_amount: buyerFeeAmount,
      p_currency: 'CAD',
      p_available_at: availableAt,
    });

    return new Response(JSON.stringify({ received: true, processed }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('stripe-webhook error:', e);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
