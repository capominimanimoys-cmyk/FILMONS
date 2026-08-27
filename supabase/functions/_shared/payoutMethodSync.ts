// Single source of truth for turning a live Stripe Connect account into the
// safe, masked payout_methods row Filmons is allowed to store. Used by both
// payout-connect-status (fast-path GET after the user returns from Stripe)
// and stripe-webhook's account.updated handler (the authoritative
// background sync) so the two can never drift on what counts as "ready".
import { sendPayoutBankAttentionEmail } from './notificationEmails.ts';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') || '';
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY };
function rest(path: string) { return `${SUPABASE_URL}/rest/v1${path}`; }

async function selectOne(table: string, filter: string) {
  const res = await fetch(rest(`/${table}?${filter}&select=*&limit=1`), { headers: H });
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] : null;
}

export interface SafePayoutMethod {
  method: 'card' | 'bank';
  displayName: string;
  last4: string | null;
  country: string | null;
  currency: string | null;
  standardPayoutEligible: boolean;
  instantPayoutEligible: boolean;
  status: 'pending' | 'ready' | 'incomplete' | 'action_required';
  requirementsDue?: string[];
}

export async function syncPayoutMethodFromStripeAccount(hostId: string, stripeAccountId: string): Promise<SafePayoutMethod | null> {
  if (!STRIPE_SECRET_KEY || !stripeAccountId) return null;

  const res = await fetch(`https://api.stripe.com/v1/accounts/${stripeAccountId}`, {
    headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
  });
  const account = await res.json();
  if (account.error) throw new Error(account.error.message);

  // Stripe needs more info to keep paying out (a Custom account's own KYC
  // requirements, distinct from "no bank account attached yet" below) --
  // this overrides whatever the details_submitted/payouts_enabled check
  // below would otherwise say, and maps to the "Bank account requires
  // attention" status the UI shows regardless of which specific field is
  // outstanding.
  const requirementsDue: string[] = account.requirements?.currently_due || [];
  const needsAttention = requirementsDue.length > 0;

  const externalAccount = account.external_accounts?.data?.[0] || null;
  if (!externalAccount) {
    // Onboarding started but no payout destination collected yet.
    await upsertPayoutMethodRow(hostId, stripeAccountId, null, {
      method: 'bank', displayName: 'Payout method', last4: null,
      country: account.country || null, currency: null,
      standardPayoutEligible: false, instantPayoutEligible: false,
      status: needsAttention ? 'action_required' : 'incomplete', requirementsDue,
    });
    return null;
  }

  const isCard = externalAccount.object === 'card';
  const baseStatus = account.details_submitted && account.payouts_enabled ? 'ready' : 'incomplete';
  const safe: SafePayoutMethod = isCard
    ? {
        method: 'card',
        displayName: `${externalAccount.brand || 'Card'} Debit`,
        last4: externalAccount.last4 || null,
        country: externalAccount.country || account.country || null,
        currency: (externalAccount.currency || '').toUpperCase() || null,
        standardPayoutEligible: !!account.payouts_enabled,
        // There's no 'card_payouts' capability (see payout-connect-start's
        // account-creation call for why) -- Stripe exposes per-card instant
        // eligibility on the external account itself instead, via
        // available_payout_methods (e.g. ["standard","instant"]).
        instantPayoutEligible: !!account.payouts_enabled && !!externalAccount.available_payout_methods?.includes('instant'),
        status: needsAttention ? 'action_required' : baseStatus, requirementsDue,
      }
    : {
        method: 'bank',
        displayName: externalAccount.bank_name || 'Bank account',
        last4: externalAccount.last4 || null,
        country: externalAccount.country || account.country || null,
        currency: (externalAccount.currency || '').toUpperCase() || null,
        standardPayoutEligible: !!account.payouts_enabled,
        instantPayoutEligible: false, // instant payouts are card-only in this app's V1
        status: needsAttention ? 'action_required' : baseStatus, requirementsDue,
      };

  await upsertPayoutMethodRow(hostId, stripeAccountId, externalAccount.id, safe);
  return safe;
}

async function upsertPayoutMethodRow(hostId: string, stripeAccountId: string, externalAccountId: string | null, safe: SafePayoutMethod) {
  const fields = {
    method: safe.method,
    details: null, // Stripe-backed rows never store raw destination data
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
    requirements_due: safe.requirementsDue?.length ? safe.requirementsDue : null,
    updated_at: new Date().toISOString(),
  };

  // Genuinely upsert by stripe_connect_account_id rather than always
  // inserting a fresh row -- this function re-runs on every account.updated
  // webhook (identity change, bank account added, KYC status change), and
  // a plain "clear default, insert new" would silently wipe
  // account_type/account_holder_type set separately by
  // submit-payout-bank-account/setup-payout-account each time it fired.
  const existing = await fetch(
    rest(`/payout_methods?host_id=eq.${hostId}&stripe_connect_account_id=eq.${stripeAccountId}&select=id,status&limit=1`),
    { headers: H },
  ).then(r => r.json()).catch(() => []);
  const existingRow = Array.isArray(existing) ? existing[0] : null;

  if (existingRow?.id) {
    await fetch(rest(`/payout_methods?id=eq.${existingRow.id}`), {
      method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify(fields),
    });
    // Only on the transition into action_required, not every re-sync, so a
    // host isn't re-emailed on every account.updated webhook while still
    // stuck on the same outstanding requirement.
    if (safe.status === 'action_required' && existingRow.status !== 'action_required') {
      const profile = await selectOne('profiles', `id=eq.${hostId}`);
      await sendPayoutBankAttentionEmail({ toEmail: profile?.email, toName: profile?.name }).catch(() => {});
    }
    return;
  }

  // First time this account produces a row — only one default payout
  // method per host, same pattern walletApi.savePayoutMethod uses.
  await fetch(rest(`/payout_methods?host_id=eq.${hostId}&is_default=eq.true`), {
    method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
    body: JSON.stringify({ is_default: false }),
  });
  await fetch(rest('/payout_methods'), {
    method: 'POST', headers: { ...H, Prefer: 'return=minimal' },
    body: JSON.stringify({ host_id: hostId, is_default: true, ...fields }),
  });
}
