// Thin wrapper around fn_request_payout — replaces the old direct client
// insert into payout_requests (which never reserved anything, so a second
// simultaneous request could draw on the same available balance). This
// runs the whole check-and-reserve as one atomic DB transaction (SELECT
// ... FOR UPDATE inside the function), not a client-side check-then-insert.
import { claimEmailEvent } from '../_shared/emailEvents.ts';
import { sendWithdrawalReceivedEmail, sendCashOutRequestAdminEmail, sendPayoutSentEmail, sendPayoutFailedEmail } from '../_shared/notificationEmails.ts';

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

function describePayoutDestination(method: any, destination: any): string {
  if (method?.display_name) return method.last4 ? `${method.display_name} ••••${method.last4}` : method.display_name;
  if (destination?.email) return `Interac — ${destination.email}`;
  if (destination?.accountNumber) return `Bank transfer — account ending ${String(destination.accountNumber).slice(-4)}`;
  return 'Not specified';
}

async function notifyHostRequested(
  hostId: string, amount: number, feeAmount: number, netAmount: number,
  payoutRequestId: string, payoutMethod: string | null, payoutDestination: any,
) {
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
    feeAmount, netAmount,
  });
  await sendCashOutRequestAdminEmail({
    withdrawalId: payoutRequestId, userName: host?.name || 'Unknown', userEmail: host?.email,
    requestedAmount: amount, feeAmount, netAmount, currency: 'CAD',
    payoutMethod: method?.display_name || payoutMethod || 'Not specified',
    payoutDetails: describePayoutDestination(method, payoutDestination),
    requestedAt: new Date().toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' }),
  }).catch(() => {});
}

async function rpc(fn: string, args: Record<string, unknown>) {
  return fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H, body: JSON.stringify(args) });
}

// Filmons' wallet ledger is entirely CAD, but a Stripe Payout's currency
// must match what the destination bank account can actually receive -- a
// USD external_account rejects a CAD-denominated payout outright. Stripe
// has no side-effect-free "quote" endpoint for what a given CAD amount
// converts to, so this uses a real daily ECB rate (Frankfurter, no key
// required) as the actual conversion source for the payout amount --
// handleAutomatedPayout applies a small safety margin on top so a rate
// snapshot slightly stale relative to Stripe's own live conversion can
// only ever request a little less than the transferred CAD balance
// covers, never more (which would otherwise risk the payout call failing
// against a balance that doesn't quite stretch that far). Returns null on
// any failure so the caller fails closed instead of guessing.
async function fetchIndicativeRate(from: string, to: string): Promise<number | null> {
  try {
    const res = await fetch(`https://api.frankfurter.app/latest?from=${from}&to=${to}`);
    const data = await res.json();
    const rate = data?.rates?.[to];
    return typeof rate === 'number' && rate > 0 ? rate : null;
  } catch {
    return null;
  }
}

// Real, automated fulfillment for a Stripe Custom-account payout method --
// $0 Filmons fee always (no platform_fee_rate/config involved at all, see
// the migration's fn_request_payout_automated). Money actually moves in
// two Stripe calls: a Transfer (platform balance -> connected account),
// then a Payout on the connected account (its balance -> their bank),
// mirroring the standard "separate charges and transfers" platform
// pattern -- Filmons collects all charges into its own Stripe account
// today (see stripe-charge/checkout-quote), so a Transfer is required
// before Stripe will ever pay the connected account's own bank.
async function handleAutomatedPayout(hostId: string, amount: number, method: any) {
  const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

  const reserveRes = await rpc('fn_request_payout_automated', { p_host_id: hostId, p_amount: amount, p_currency: 'CAD' });
  const payoutRequestId = await reserveRes.json();
  if (!reserveRes.ok) {
    const message = typeof payoutRequestId === 'object' && payoutRequestId?.message ? payoutRequestId.message : 'Could not request payout';
    return j({ error: message.includes('Insufficient') ? 'Insufficient available balance' : message }, 400);
  }

  const SK = Deno.env.get('STRIPE_SECRET_KEY');
  if (!SK) { await rpc('fn_reverse_payout_request', { p_payout_request_id: payoutRequestId }); return j({ error: 'Payouts are temporarily unavailable' }, 500); }
  const stripeHeaders = { Authorization: `Bearer ${SK}`, 'Content-Type': 'application/x-www-form-urlencoded' };
  const cents = Math.round(amount * 100);

  const fail = async (reason: string) => {
    await rpc('fn_reverse_payout_request', { p_payout_request_id: payoutRequestId });
    await fetch(rest(`/payout_requests?id=eq.${payoutRequestId}`), {
      method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'failed', admin_notes: reason, completed_at: new Date().toISOString() }),
    });
    const host = await selectOne('profiles', `id=eq.${hostId}`);
    await sendPayoutFailedEmail({ toEmail: host?.email, toName: host?.name, amount, currency: 'CAD', withdrawalId: payoutRequestId }).catch(() => {});
    return j({ error: 'Could not complete payout — your funds have been returned to your available balance.' }, 400);
  };

  const transferRes = await fetch('https://api.stripe.com/v1/transfers', {
    method: 'POST', headers: stripeHeaders,
    body: new URLSearchParams({ amount: String(cents), currency: 'cad', destination: method.stripe_connect_account_id, 'metadata[payout_request_id]': payoutRequestId }),
  });
  const transfer = await transferRes.json();
  if (transfer.error) return fail(transfer.error.message);

  // CAD destinations pay out exactly what was transferred, no conversion.
  // Anything else (today: USD) needs a real exchange rate -- see
  // fetchIndicativeRate's comment for why this is the actual conversion
  // source, not just a display estimate, and why it's shaded down slightly.
  const destCurrency = (method.currency || 'CAD').toUpperCase();
  let payoutAmountCents = cents;
  let payoutCurrency = 'cad';
  if (destCurrency !== 'CAD') {
    const rate = await fetchIndicativeRate('CAD', destCurrency);
    if (!rate) return fail('Currency conversion is temporarily unavailable — please try again shortly.');
    const SAFETY_MARGIN = 0.99;
    payoutAmountCents = Math.floor(cents * rate * SAFETY_MARGIN);
    payoutCurrency = destCurrency.toLowerCase();
  }

  const payoutRes = await fetch('https://api.stripe.com/v1/payouts', {
    method: 'POST', headers: { ...stripeHeaders, 'Stripe-Account': method.stripe_connect_account_id },
    body: new URLSearchParams({ amount: String(payoutAmountCents), currency: payoutCurrency }),
  });
  const payout = await payoutRes.json();
  if (payout.error) return fail(payout.error.message);

  // Never promise an exact arrival date beyond Stripe's own -- if the
  // Payout response includes one, store/show it; otherwise the frontend
  // only ever shows the generic 1-6 business day range.
  const arrivalDate = payout.arrival_date ? new Date(payout.arrival_date * 1000).toISOString() : null;
  // payout.amount/payout.currency are Stripe's own confirmation of what was
  // actually sent -- the real post-conversion figure, not our estimate.
  const sentAmount = typeof payout.amount === 'number' ? payout.amount / 100 : payoutAmountCents / 100;
  const sentCurrency = (payout.currency || payoutCurrency).toUpperCase();
  const isCrossCurrency = sentCurrency !== 'CAD';
  await fetch(rest(`/payout_requests?id=eq.${payoutRequestId}`), {
    method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
    body: JSON.stringify({
      status: 'sent', stripe_transfer_id: transfer.id, stripe_payout_id: payout.id, arrival_date: arrivalDate,
      payout_currency: isCrossCurrency ? sentCurrency : null,
      payout_amount: isCrossCurrency ? sentAmount : null,
    }),
  });

  const claimed = await claimEmailEvent(`payout_sent:${payoutRequestId}`);
  if (claimed) {
    const host = await selectOne('profiles', `id=eq.${hostId}`);
    await sendPayoutSentEmail({
      toEmail: host?.email, toName: host?.name,
      amount: isCrossCurrency ? sentAmount : amount, currency: sentCurrency,
      destinationLabel: method.display_name ? `${method.display_name} ••••${method.last4 || ''}` : `•••• ${method.last4 || ''}`,
      arrivalDate,
    }).catch(() => {});
  }
  await fetch(rest('/notifications'), {
    method: 'POST', headers: { ...H, Prefer: 'return=minimal' },
    body: JSON.stringify({ user_id: hostId, actor_id: null, actor_name: 'Filmons', type: 'payout_sent', title: `Your ${isCrossCurrency ? `$${sentAmount.toFixed(2)} ${sentCurrency}` : `$${amount.toFixed(2)} CAD`} payout is on the way`, is_read: false }),
  }).catch(() => {});

  return j({
    success: true, payoutRequestId, payoutSpeed: 'standard', feeAmount: 0, platformFeeRate: 0, platformFeeAmount: 0,
    netAmount: amount, estimatedArrivalAt: arrivalDate,
    payoutCurrency: isCrossCurrency ? sentCurrency : null, payoutAmount: isCrossCurrency ? sentAmount : null,
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  try {
    const body = await req.json();

    // Cancel path: user backing out of their own still-open request.
    // Reuses this function rather than a new one since it already holds
    // the service-role RPC-calling setup.
    if (body.action === 'cancel') {
      const { hostId, payoutRequestId } = body;
      if (!hostId || !payoutRequestId) {
        return new Response(JSON.stringify({ error: 'Missing hostId or payoutRequestId' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/fn_cancel_payout_request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
        body: JSON.stringify({ p_payout_request_id: payoutRequestId, p_host_id: hostId }),
      });
      const cancelled = await res.json();
      if (!res.ok || cancelled !== true) {
        return new Response(JSON.stringify({ error: 'Could not cancel — it may have already been reviewed' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ success: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const { hostId, amount, payoutMethod, payoutDestination, payoutSpeed } = body;
    if (!hostId || typeof amount !== 'number' || amount <= 0) {
      return new Response(JSON.stringify({ error: 'Missing hostId or invalid amount' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    if (payoutMethod && !['interac', 'bank_transfer', 'card', 'bank'].includes(payoutMethod)) {
      return new Response(JSON.stringify({ error: 'Invalid payout method' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // Which pipeline handles this request is resolved from the host's own
    // saved default payout method, never trusted from the client -- same
    // "look up the fact server-side" convention used everywhere else in
    // this app (e.g. normalizeTier for account tier).
    const defaultMethod = await selectOne('payout_methods', `host_id=eq.${hostId}&is_default=eq.true`);
    if (defaultMethod?.provider === 'stripe') {
      return handleAutomatedPayout(hostId, amount, defaultMethod);
    }

    const speed = payoutSpeed === 'instant' ? 'instant' : 'standard';

    // Fees/arrival estimate are computed server-side from the live config —
    // never trusted from the client. No real Stripe Connect exists in this
    // app, so "instant" means priority-processed within the same manual
    // admin pipeline, not an automated transfer.
    const config = await selectOne('payout_config', 'id=eq.1');
    const platformFeeRate = config?.withdrawal_fee_rate ?? 0.08;
    const platformFeeAmount = round2(amount * platformFeeRate);

    let feeAmount = 0;
    if (speed === 'instant') {
      const rate = config?.instant_fee_rate ?? 0.02;
      feeAmount = round2(amount * rate);
    }
    const estimatedArrivalAt = speed === 'instant' ? new Date() : addBusinessDays(new Date(), 2);

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
        p_platform_fee_rate: platformFeeRate,
        p_platform_fee_amount: platformFeeAmount,
      }),
    });
    const result = await res.json();
    if (!res.ok) {
      const message = typeof result === 'object' && result?.message ? result.message : 'Could not request payout';
      return new Response(JSON.stringify({ error: message.includes('Insufficient') ? 'Insufficient available balance' : message }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const netAmount = round2(amount - feeAmount - platformFeeAmount);
    notifyHostRequested(hostId, amount, feeAmount + platformFeeAmount, netAmount, result, payoutMethod || null, payoutDestination).catch(() => {});

    return new Response(JSON.stringify({
      success: true, payoutRequestId: result,
      payoutSpeed: speed, feeAmount, platformFeeRate, platformFeeAmount,
      netAmount, estimatedArrivalAt: estimatedArrivalAt.toISOString(),
    }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('request-payout error:', e);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
