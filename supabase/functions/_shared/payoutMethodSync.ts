// Single source of truth for turning a live Stripe Connect account into the
// safe, masked payout_methods row Filmons is allowed to store. Used by both
// payout-connect-status (fast-path GET after the user returns from Stripe)
// and stripe-webhook's account.updated handler (the authoritative
// background sync) so the two can never drift on what counts as "ready".
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') || '';
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY };
function rest(path: string) { return `${SUPABASE_URL}/rest/v1${path}`; }

export interface SafePayoutMethod {
  method: 'card' | 'bank';
  displayName: string;
  last4: string | null;
  country: string | null;
  currency: string | null;
  standardPayoutEligible: boolean;
  instantPayoutEligible: boolean;
  status: 'pending' | 'ready' | 'incomplete';
}

export async function syncPayoutMethodFromStripeAccount(hostId: string, stripeAccountId: string): Promise<SafePayoutMethod | null> {
  if (!STRIPE_SECRET_KEY || !stripeAccountId) return null;

  const res = await fetch(`https://api.stripe.com/v1/accounts/${stripeAccountId}`, {
    headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
  });
  const account = await res.json();
  if (account.error) throw new Error(account.error.message);

  const externalAccount = account.external_accounts?.data?.[0] || null;
  if (!externalAccount) {
    // Onboarding started but no payout destination collected yet.
    await upsertPayoutMethodRow(hostId, stripeAccountId, null, {
      method: 'bank', displayName: 'Payout method', last4: null,
      country: account.country || null, currency: null,
      standardPayoutEligible: false, instantPayoutEligible: false, status: 'incomplete',
    });
    return null;
  }

  const isCard = externalAccount.object === 'card';
  const safe: SafePayoutMethod = isCard
    ? {
        method: 'card',
        displayName: `${externalAccount.brand || 'Card'} Debit`,
        last4: externalAccount.last4 || null,
        country: externalAccount.country || account.country || null,
        currency: (externalAccount.currency || '').toUpperCase() || null,
        standardPayoutEligible: !!account.payouts_enabled,
        instantPayoutEligible: account.capabilities?.card_payouts === 'active',
        status: account.details_submitted && account.payouts_enabled ? 'ready' : 'incomplete',
      }
    : {
        method: 'bank',
        displayName: externalAccount.bank_name || 'Bank account',
        last4: externalAccount.last4 || null,
        country: externalAccount.country || account.country || null,
        currency: (externalAccount.currency || '').toUpperCase() || null,
        standardPayoutEligible: !!account.payouts_enabled,
        instantPayoutEligible: false, // instant payouts are card-only in this app's V1
        status: account.details_submitted && account.payouts_enabled ? 'ready' : 'incomplete',
      };

  await upsertPayoutMethodRow(hostId, stripeAccountId, externalAccount.id, safe);
  return safe;
}

async function upsertPayoutMethodRow(hostId: string, stripeAccountId: string, externalAccountId: string | null, safe: SafePayoutMethod) {
  // Same "clear old default, insert new" pattern walletApi.savePayoutMethod
  // already used client-side — only one default payout method per host.
  await fetch(rest(`/payout_methods?host_id=eq.${hostId}&is_default=eq.true`), {
    method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
    body: JSON.stringify({ is_default: false }),
  });

  await fetch(rest('/payout_methods'), {
    method: 'POST', headers: { ...H, Prefer: 'return=minimal' },
    body: JSON.stringify({
      host_id: hostId,
      method: safe.method,
      details: null, // Stripe-backed rows never store raw destination data
      is_default: true,
      provider: 'stripe',
      stripe_connect_account_id: stripeAccountId,
      stripe_external_account_id: externalAccountId,
      display_name: safe.displayName,
      last4: safe.last4,
      country: safe.country,
      currency: safe.currency,
      standard_payout_eligible: safe.standardPayoutEligible,
      instant_payout_eligible: safe.instantPayoutEligible,
      status: safe.status,
      updated_at: new Date().toISOString(),
    }),
  });
}
