// Ledger crediting for "cash-equivalent" payment methods (e-transfer, debit,
// etc.) — the ones this app already treats as immediately-confirmed real
// money with no Stripe transaction to hook a webhook off of (see
// Checkout.tsx's non-card handlePay path). Calls the same
// fn_finalize_payment used by stripe-webhook, so there is exactly one place
// wallet balances ever change regardless of payment method — the frontend
// only supplies the reference numbers, never the split itself (the amounts
// passed here are cross-checked against a fresh checkout-quote calculation,
// not trusted as-is).
import { computeBreakdown } from '../_shared/pricing.ts';
import { addBusinessDays } from '../_shared/businessDays.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

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

  try {
    const { orderId, hostId, subtotal, rentalEndDate } = await req.json();
    if (!orderId || !hostId || typeof subtotal !== 'number') {
      return new Response(JSON.stringify({ error: 'Missing orderId, hostId, or subtotal' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // Re-derive the fee split server-side — never trust a client-sent fee
    // breakdown, same principle as stripe-charge.
    const breakdown = await computeBreakdown({ subtotal });

    // Same 5-business-day hold as every other earning path on Filmons (see
    // stripe-webhook/index.ts), anchored to the rental end date if known.
    const availableAt = addBusinessDays(rentalEndDate ? new Date(rentalEndDate) : new Date(), 5).toISOString();

    const processed = await rpc('fn_finalize_payment', {
      p_idempotency_key: `cash_${orderId}`,
      p_order_id: orderId,
      p_host_id: hostId,
      p_subtotal: breakdown.subtotal,
      p_seller_fee_amount: breakdown.sellerFeeAmount,
      p_buyer_fee_amount: breakdown.buyerFeeAmount,
      p_currency: 'CAD',
      p_available_at: availableAt,
    });

    return new Response(JSON.stringify({ success: true, processed, breakdown }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('finalize-cash-payment error:', e);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
