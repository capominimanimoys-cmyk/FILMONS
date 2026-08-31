// Reconciles Filmons' wallet_transactions against live Stripe data --
// Stripe never pushes a webhook for "this specific balance transaction
// just became available" (balance.available only says the platform's
// overall balance changed, not which transactions), so this actively
// re-checks anything still pending on a schedule instead. Run before
// fn_release_pending_earnings on the same hourly tick (see
// release-pending-earnings/index.ts) so a row's payout_availability_status
// is never stale by the time the release pass looks at it.
//
// Also does the one-time backfill for existing rows created before the
// Stripe-availability columns existed: any pending wallet_transactions row
// with a linked stripe_payment_intent_id but no stripe_balance_transaction_id
// yet gets resolved here too, on its next hourly pass — same code path,
// no separate one-off script needed.
import { fetchStripeAvailability, fetchBalanceTransaction } from '../_shared/stripeBalanceAvailability.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY };
function rest(path: string) { return `${SUPABASE_URL}/rest/v1${path}`; }

async function rpc(fn: string, args: Record<string, unknown>) {
  const res = await fetch(rest(`/rpc/${fn}`), { method: 'POST', headers: H, body: JSON.stringify(args) });
  if (!res.ok) console.error(`${fn} failed:`, res.status, await res.text());
  return res.ok;
}

// Capped per run (hourly cadence, one Stripe API call per row) -- plenty
// of headroom for normal volume without risking a rate-limit spike.
const BATCH_LIMIT = 200;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const res = await fetch(
      rest(
        `/wallet_transactions?balance_type=eq.pending&status=eq.pending` +
        `&stripe_payment_intent_id=not.is.null` +
        `&or=(payout_availability_status.is.null,payout_availability_status.eq.pending)` +
        `&select=id,stripe_payment_intent_id,stripe_balance_transaction_id&limit=${BATCH_LIMIT}`,
      ),
      { headers: H },
    );
    const rows: Array<{ id: string; stripe_payment_intent_id: string; stripe_balance_transaction_id: string | null }> = await res.json();

    let checked = 0;
    let updated = 0;
    let nowAvailable = 0;

    for (const row of rows || []) {
      checked++;
      const avail = row.stripe_balance_transaction_id
        ? await fetchBalanceTransaction(row.stripe_balance_transaction_id)
        : await fetchStripeAvailability(row.stripe_payment_intent_id);

      if (!avail.balanceTransactionId || !avail.availableOn) continue; // still unresolved, try again next hour

      const ok = await rpc('fn_sync_stripe_balance_transaction', {
        p_wallet_transaction_id: row.id,
        p_stripe_charge_id: avail.chargeId,
        p_stripe_balance_transaction_id: avail.balanceTransactionId,
        p_stripe_available_on: avail.availableOn,
        p_payout_availability_status: avail.payoutStatus,
      });
      if (ok) {
        updated++;
        if (avail.payoutStatus === 'available') nowAvailable++;
      }
    }

    return new Response(JSON.stringify({ success: true, checked, updated, nowAvailable }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('sync-stripe-balance-availability error:', e);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
