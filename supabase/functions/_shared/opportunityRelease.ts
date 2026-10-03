// Releases an approved Opportunity's held earning through the payment
// provider's own settlement state, right away instead of waiting for the
// hourly release-pending-earnings tick. Used by manage-application
// (client approval) and release-pending-earnings (auto-approval policy).
//
// Steps, each one the same as the hourly path already does:
//   1. Re-check the charge's Stripe balance transaction (settled or not)
//      and store it via fn_sync_stripe_balance_transaction.
//   2. fn_release_opportunity_earning moves the row pending -> available
//      only if Stripe says the funds are available, the order isn't
//      disputed, and the work is approved.
// Returns the resulting release_status. 'processing' simply means the
// hourly pass will finish the release once Stripe settles; it is never
// shown to the worker as withdrawable.
import { fetchStripeAvailability, fetchBalanceTransaction } from './stripeBalanceAvailability.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY };
function rest(path: string) { return `${SUPABASE_URL}/rest/v1${path}`; }

export type ReleaseStatus = 'held' | 'processing' | 'available';

export async function releaseOpportunityEarning(orderId: string | null | undefined): Promise<ReleaseStatus> {
  if (!orderId) return 'processing';
  try {
    const res = await fetch(
      rest(`/wallet_transactions?order_id=eq.${encodeURIComponent(orderId)}&transaction_type=eq.opportunity_earning` +
        `&balance_type=eq.pending&status=eq.pending&select=id,stripe_payment_intent_id,stripe_balance_transaction_id,payout_availability_status`),
      { headers: H },
    );
    const rows: Array<{ id: string; stripe_payment_intent_id: string | null; stripe_balance_transaction_id: string | null; payout_availability_status: string | null }> =
      await res.json().catch(() => []);

    for (const row of Array.isArray(rows) ? rows : []) {
      if (row.payout_availability_status === 'available') continue;
      if (!row.stripe_balance_transaction_id && !row.stripe_payment_intent_id) continue;
      const avail = row.stripe_balance_transaction_id
        ? await fetchBalanceTransaction(row.stripe_balance_transaction_id)
        : await fetchStripeAvailability(row.stripe_payment_intent_id);
      if (!avail.balanceTransactionId || !avail.availableOn) continue;
      const syncRes = await fetch(rest('/rpc/fn_sync_stripe_balance_transaction'), {
        method: 'POST', headers: H,
        body: JSON.stringify({
          p_wallet_transaction_id: row.id,
          p_stripe_charge_id: avail.chargeId,
          p_stripe_balance_transaction_id: avail.balanceTransactionId,
          p_stripe_available_on: avail.availableOn,
          p_payout_availability_status: avail.payoutStatus,
        }),
      });
      if (!syncRes.ok) console.error('fn_sync_stripe_balance_transaction failed:', syncRes.status, await syncRes.text());
    }

    const releaseRes = await fetch(rest('/rpc/fn_release_opportunity_earning'), {
      method: 'POST', headers: H, body: JSON.stringify({ p_order_id: orderId }),
    });
    if (!releaseRes.ok) {
      console.error('fn_release_opportunity_earning failed:', releaseRes.status, await releaseRes.text());
      return 'processing';
    }
    const status = await releaseRes.json().catch(() => 'processing');
    return status === 'available' ? 'available' : 'processing';
  } catch (e) {
    console.error('releaseOpportunityEarning threw:', e);
    return 'processing';
  }
}
