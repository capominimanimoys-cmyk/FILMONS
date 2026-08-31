// Stripe is the source of truth for when a charge's funds are actually
// available in Filmons' own Stripe balance -- never a locally computed
// estimate (payment date + N days). Given a PaymentIntent id, fetches its
// latest charge's balance transaction and returns exactly what Stripe's
// own Balance page shows for it: available_on (the real settlement
// date) and status ('pending' | 'available').
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') || '';

export interface StripeAvailability {
  chargeId: string | null;
  balanceTransactionId: string | null;
  availableOn: string | null; // ISO timestamp, or null if unresolved
  payoutStatus: 'pending' | 'available' | null;
}

const EMPTY: StripeAvailability = { chargeId: null, balanceTransactionId: null, availableOn: null, payoutStatus: null };

// Best-effort: never throws. A Stripe API hiccup here must not block
// crediting a wallet for a payment Stripe has already told us (via the
// webhook event itself) succeeded -- the caller falls back to its
// existing hold-period date, and the hourly reconciliation pass
// (sync-stripe-balance-availability) picks up anything left unresolved.
export async function fetchStripeAvailability(paymentIntentId: string | null | undefined): Promise<StripeAvailability> {
  if (!paymentIntentId || !STRIPE_SECRET_KEY) return EMPTY;
  try {
    const res = await fetch(
      `https://api.stripe.com/v1/payment_intents/${paymentIntentId}?expand[]=latest_charge.balance_transaction`,
      { headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` } },
    );
    if (!res.ok) {
      console.warn('fetchStripeAvailability: payment_intents fetch failed', res.status, await res.text());
      return EMPTY;
    }
    const pi = await res.json();
    const charge = pi.latest_charge;
    if (!charge) return EMPTY;
    const bt = charge.balance_transaction;
    if (!bt || typeof bt !== 'object') {
      // Charge exists but its balance transaction isn't posted yet (can
      // happen for a just-created charge) -- known chargeId, unresolved
      // availability. The reconciliation pass will pick this up later.
      return { ...EMPTY, chargeId: charge.id || null };
    }
    return {
      chargeId: charge.id,
      balanceTransactionId: bt.id,
      availableOn: bt.available_on ? new Date(bt.available_on * 1000).toISOString() : null,
      payoutStatus: bt.status === 'available' ? 'available' : 'pending',
    };
  } catch (e) {
    console.warn('fetchStripeAvailability threw:', e);
    return EMPTY;
  }
}

// Re-checks one already-known balance transaction directly (used by the
// reconciliation pass, which already has the id and just needs the
// current status/date rather than a full PaymentIntent lookup).
export async function fetchBalanceTransaction(balanceTransactionId: string): Promise<StripeAvailability> {
  if (!balanceTransactionId || !STRIPE_SECRET_KEY) return EMPTY;
  try {
    const res = await fetch(`https://api.stripe.com/v1/balance_transactions/${balanceTransactionId}`, {
      headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
    });
    if (!res.ok) {
      console.warn('fetchBalanceTransaction failed', res.status, await res.text());
      return EMPTY;
    }
    const bt = await res.json();
    return {
      chargeId: typeof bt.source === 'string' ? bt.source : null,
      balanceTransactionId: bt.id,
      availableOn: bt.available_on ? new Date(bt.available_on * 1000).toISOString() : null,
      payoutStatus: bt.status === 'available' ? 'available' : 'pending',
    };
  } catch (e) {
    console.warn('fetchBalanceTransaction threw:', e);
    return EMPTY;
  }
}
