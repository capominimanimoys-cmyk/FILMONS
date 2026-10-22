// Gives a FAILED withdrawal's money back to the user's Available balance -- but only once the money has really
// come back to Filmons: the Stripe transfer that moved it to the user's connected account is reversed first, and the
// wallet is credited only after Stripe confirms that. If Stripe can't reverse it yet, the withdrawal stays
// 'return pending' and is retried hourly (see release-pending-earnings); after 48h it is flagged for review instead
// of ever crediting money that hasn't come back.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY };
const rest = (p: string) => `${SUPABASE_URL}/rest/v1${p}`;

export type ReturnOutcome = 'returned' | 'pending' | 'needs_review';

const REVIEW_AFTER_MS = 48 * 3600 * 1000;

async function patch(id: string, body: Record<string, unknown>) {
  await fetch(rest(`/payout_requests?id=eq.${id}`), { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(body) }).catch(() => {});
}

export async function returnFailedPayout(payoutRequestId: string): Promise<ReturnOutcome> {
  const res = await fetch(rest(`/payout_requests?id=eq.${payoutRequestId}&select=*&limit=1`), { headers: H });
  const rows = await res.json().catch(() => []);
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return 'needs_review';
  if (row.return_status === 'returned') return 'returned';

  if (row.stripe_transfer_id) {
    const SK = Deno.env.get('STRIPE_SECRET_KEY');
    if (!SK) { await patch(row.id, { return_status: 'pending' }); return 'pending'; }
    const cents = Math.round(Number(row.amount) * 100);
    const r = await fetch(`https://api.stripe.com/v1/transfers/${row.stripe_transfer_id}/reversals`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SK}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': `payout-return:${row.id}` },
      body: new URLSearchParams({ amount: String(cents), 'metadata[payout_request_id]': row.id }),
    });
    const j = await r.json().catch(() => ({}));
    const alreadyReversed = /already.*reversed|fully reversed/i.test(String(j?.error?.message || ''));
    if (j?.error && !alreadyReversed) {
      const age = Date.now() - new Date(row.completed_at || row.created_at || Date.now()).getTime();
      if (age > REVIEW_AFTER_MS) { await patch(row.id, { return_status: 'needs_review' }); return 'needs_review'; }
      await patch(row.id, { return_status: 'pending' });
      return 'pending';
    }
  }

  // The money is back with Filmons (or never left): credit the wallet, exactly once.
  await fetch(rest('/rpc/fn_return_failed_payout'), { method: 'POST', headers: H, body: JSON.stringify({ p_payout_request_id: row.id }) });
  return 'returned';
}

/** What went wrong and what the user should do, in plain words. */
export function describePayoutFailure(code?: string | null, message?: string | null): string {
  switch (code) {
    case 'account_closed': return 'Your bank says this account is closed. Add a different bank account in your payout settings.';
    case 'account_frozen': return 'Your bank account is frozen. Contact your bank, or add a different account in your payout settings.';
    case 'bank_account_restricted': return 'Your bank account can’t receive payouts. Contact your bank, or add a different account.';
    case 'bank_ownership_changed': return 'The bank account changed owners. Add your current bank account in your payout settings.';
    case 'invalid_account_number': return 'The account number looks wrong. Check your bank details in your payout settings.';
    case 'no_account': return 'We couldn’t find that bank account. Check your bank details in your payout settings.';
    case 'could_not_process': return 'Your bank couldn’t process the transfer. Check your bank details, then try again.';
    case 'declined': return 'Your bank declined the transfer. Contact your bank, then try again.';
    case 'insufficient_funds': return 'Stripe didn’t have enough available funds to send this payout. Please try again later.';
    default: return message ? `Your bank or Stripe couldn’t complete it: ${message}` : 'Your bank or Stripe couldn’t complete it. Check your payout settings and try again.';
  }
}
