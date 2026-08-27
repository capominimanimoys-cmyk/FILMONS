// Attaches (or removes) a Canadian bank account on a host's Stripe Connect
// Custom account — the raw institution/transit/account numbers only ever
// exist in this request body and the outbound Stripe form-encoded call;
// they are never written to any Supabase table and never appear in a
// console.log. Only the safe, masked result (via
// _shared/payoutMethodSync.ts) is persisted.
//
// Requires a stepUpToken minted by verify-identity (same gate as
// setup-payout-account) and an identity step already completed
// (profiles.stripe_connect_account_id set).
import { verifyStepUpToken } from '../_shared/stepUpAuth.ts';
import { syncPayoutMethodFromStripeAccount } from '../_shared/payoutMethodSync.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY };
function rest(path: string) { return `${SUPABASE_URL}/rest/v1${path}`; }

async function selectOne(table: string, filter: string) {
  const res = await fetch(rest(`/${table}?${filter}&select=*&limit=1`), { headers: H });
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] : null;
}

const PURPOSE = 'payout_method';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const body = await req.json();
    const { userId, stepUpToken, action } = body as { userId?: string; stepUpToken?: string; action?: 'save' | 'remove' };
    if (!userId || !action) return json({ error: 'Missing required fields' }, 400);

    const validStepUp = await verifyStepUpToken(stepUpToken || '', userId, PURPOSE);
    if (!validStepUp) return json({ error: 'Please verify your identity again — this took too long.' }, 401);

    const profile = await selectOne('profiles', `id=eq.${userId}`);
    const accountId = profile?.stripe_connect_account_id as string | undefined;
    if (!accountId) return json({ error: 'Complete identity setup before adding a bank account' }, 400);

    const SK = Deno.env.get('STRIPE_SECRET_KEY');
    if (!SK) return json({ error: 'Stripe not configured' }, 500);
    const authHeader = { Authorization: `Bearer ${SK}` };

    if (action === 'remove') {
      const existing = await selectOne('payout_methods', `host_id=eq.${userId}&stripe_connect_account_id=eq.${accountId}`);
      if (existing?.stripe_external_account_id) {
        await fetch(`https://api.stripe.com/v1/accounts/${accountId}/external_accounts/${existing.stripe_external_account_id}`, {
          method: 'DELETE', headers: authHeader,
        }).catch(() => {}); // best-effort -- still clear the local row even if Stripe's side 404s
      }
      if (existing) {
        await fetch(rest(`/payout_methods?id=eq.${existing.id}`), {
          method: 'DELETE', headers: H,
        });
      }
      return json({ success: true });
    }

    const { accountHolderName, institutionNumber, transitNumber, accountNumber, accountType } = body as {
      accountHolderName?: string; institutionNumber?: string; transitNumber?: string; accountNumber?: string; accountType?: 'chequing' | 'savings';
    };
    if (!accountHolderName || !institutionNumber || !transitNumber || !accountNumber) {
      return json({ error: 'Missing bank account details' }, 400);
    }

    // Delete any existing external account first -- Custom accounts can
    // hold multiple, but Filmons only ever shows/uses one default, and
    // "Change bank account" is meant to fully replace the destination, not
    // add a second one Stripe might pay out to instead.
    const existing = await selectOne('payout_methods', `host_id=eq.${userId}&stripe_connect_account_id=eq.${accountId}`);
    if (existing?.stripe_external_account_id) {
      await fetch(`https://api.stripe.com/v1/accounts/${accountId}/external_accounts/${existing.stripe_external_account_id}`, {
        method: 'DELETE', headers: authHeader,
      }).catch(() => {});
    }

    const params = new URLSearchParams({
      'external_account[object]': 'bank_account',
      'external_account[country]': 'CA',
      'external_account[currency]': 'cad',
      'external_account[account_holder_name]': accountHolderName,
      'external_account[account_holder_type]': profile?.payout_account_type === 'company' ? 'company' : 'individual',
      // Stripe's documented CA routing_number format: 5-digit transit -
      // 3-digit institution, e.g. "12345-001".
      'external_account[routing_number]': `${transitNumber}-${institutionNumber}`,
      'external_account[account_number]': accountNumber,
    });
    const res = await fetch(`https://api.stripe.com/v1/accounts/${accountId}/external_accounts`, {
      method: 'POST', headers: { ...authHeader, 'Content-Type': 'application/x-www-form-urlencoded' }, body: params,
    });
    const externalAccount = await res.json();
    if (externalAccount.error) return json({ error: externalAccount.error.message }, 400);

    const safe = await syncPayoutMethodFromStripeAccount(userId, accountId);

    // account_type (chequing/savings) has no Stripe equivalent -- it's
    // stored purely for Filmons' own display, so write it directly here
    // rather than threading it through the shared sync helper's Stripe-
    // sourced fields. account_holder_type mirrors the profile's choice for
    // the same display purpose.
    await fetch(rest(`/payout_methods?host_id=eq.${userId}&stripe_connect_account_id=eq.${accountId}`), {
      method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({
        account_type: accountType || null,
        account_holder_type: profile?.payout_account_type || 'individual',
      }),
    });

    return json({ success: true, payoutMethod: safe });
  } catch (e) {
    console.error('submit-payout-bank-account error:', e);
    return json({ error: 'Internal error' }, 500);
  }
});
