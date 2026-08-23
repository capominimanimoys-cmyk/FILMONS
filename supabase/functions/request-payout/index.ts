// Thin wrapper around fn_request_payout — replaces the old direct client
// insert into payout_requests (which never reserved anything, so a second
// simultaneous request could draw on the same available balance). This
// runs the whole check-and-reserve as one atomic DB transaction (SELECT
// ... FOR UPDATE inside the function), not a client-side check-then-insert.
import { claimEmailEvent } from '../_shared/emailEvents.ts';
import { sendWithdrawalReceivedEmail } from '../_shared/notificationEmails.ts';

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

function round2(n: number) { return Math.round((n + Number.EPSILON) * 100) / 100; }

// No existing business-day helper anywhere in this app — this is the
// first one. Skips Saturday/Sunday only (no statutory-holiday calendar).
function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return d;
}

async function notifyHostRequested(hostId: string, amount: number, payoutRequestId: string, payoutMethod: string | null) {
  const amountStr = `$${amount.toFixed(2)} CAD`;
  await fetch(rest('/notifications'), {
    method: 'POST', headers: { ...H, Prefer: 'return=minimal' },
    body: JSON.stringify({
      user_id: hostId, actor_id: null, actor_name: 'Filmons',
      type: 'payout_requested', title: `Your withdrawal request for ${amountStr} has been received`, is_read: false,
    }),
  }).catch(() => {});

  const claimed = await claimEmailEvent(`withdrawal_received:${payoutRequestId}`);
  if (!claimed) return; // already sent for this payout request -- retry/double-click, skip

  const [host, method] = await Promise.all([
    selectOne('profiles', `id=eq.${hostId}`),
    selectOne('payout_methods', `host_id=eq.${hostId}&is_default=eq.true`),
  ]);
  await sendWithdrawalReceivedEmail({
    toEmail: host?.email, toName: host?.name,
    amount, currency: 'CAD', withdrawalId: payoutRequestId,
    payoutMethod: method?.display_name || payoutMethod || 'Payout method',
    payoutLast4: method?.last4,
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  try {
    const { hostId, amount, payoutMethod, payoutDestination, payoutSpeed } = await req.json();
    if (!hostId || typeof amount !== 'number' || amount <= 0) {
      return new Response(JSON.stringify({ error: 'Missing hostId or invalid amount' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    if (payoutMethod && !['interac', 'bank_transfer', 'card', 'bank'].includes(payoutMethod)) {
      return new Response(JSON.stringify({ error: 'Invalid payout method' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    const speed = payoutSpeed === 'instant' ? 'instant' : 'standard';

    // Fee/arrival estimate are computed server-side from the live config —
    // never trusted from the client. No real Stripe Connect exists in this
    // app, so "instant" means priority-processed within the same manual
    // admin pipeline, not an automated transfer.
    let feeAmount = 0;
    if (speed === 'instant') {
      const config = await selectOne('payout_config', 'id=eq.1');
      const rate = config?.instant_fee_rate ?? 0.02;
      feeAmount = round2(amount * rate);
    }
    const estimatedArrivalAt = speed === 'instant' ? new Date() : addBusinessDays(new Date(), 3);

    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/fn_request_payout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
      },
      body: JSON.stringify({
        p_host_id: hostId,
        p_amount: amount,
        p_currency: 'CAD',
        p_payout_method: payoutMethod || null,
        p_payout_destination: payoutDestination || null,
        p_payout_speed: speed,
        p_fee_amount: feeAmount,
        p_estimated_arrival_at: estimatedArrivalAt.toISOString(),
      }),
    });
    const result = await res.json();
    if (!res.ok) {
      const message = typeof result === 'object' && result?.message ? result.message : 'Could not request payout';
      return new Response(JSON.stringify({ error: message.includes('Insufficient') ? 'Insufficient available balance' : message }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    notifyHostRequested(hostId, amount, result, payoutMethod || null).catch(() => {});

    return new Response(JSON.stringify({
      success: true, payoutRequestId: result,
      payoutSpeed: speed, feeAmount, netAmount: round2(amount - feeAmount),
      estimatedArrivalAt: estimatedArrivalAt.toISOString(),
    }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('request-payout error:', e);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
