// Creates/updates a Stripe Connect "Custom" account entirely from
// server-to-server calls -- no Stripe-hosted onboarding page, no redirect,
// so the payout setup flow never feels like creating a separate Stripe
// account. Replaces the orphaned Express + Account Link flow
// (payout-connect-start, deleted) which redirected to Stripe for this step.
//
// Requires a stepUpToken minted by verify-identity, same enforcement point
// the deleted Express flow used -- "Verify It's You" must happen before any
// payout-method screen is shown.
//
// Deliberately does NOT hard-code which identity fields Canada/individual/
// business needs beyond the near-universal baseline (name, DOB, address for
// an individual; legal name + address for a company). Whatever Stripe
// returns in requirements.currently_due after this call is handed back
// verbatim so the frontend can render a follow-up screen only for fields
// actually required for this account -- never guessed upfront.
import { verifyStepUpToken } from '../_shared/stepUpAuth.ts';

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

type PayoutCountry = 'CA' | 'US';
const SUPPORTED_COUNTRIES: PayoutCountry[] = ['CA', 'US'];

interface PersonInput {
  firstName: string; lastName: string;
  dob: { day: number; month: number; year: number };
  address: { line1: string; city: string; province: string; postalCode: string };
  phone?: string;
  idNumber?: string;   // individual.id_number (CA SIN / US full SSN) -- only sent when Stripe asked for it
  ssnLast4?: string;   // individual.ssn_last_4 (US) -- only sent when Stripe asked for it
}

// Stripe's form-encoded bracket nesting: nest(['individual','dob','day'])
// -> 'individual[dob][day]'; nest(['dob','day']) -> 'dob[day]' (the bare
// form, for a top-level Person where fields aren't nested under anything).
function nest(path: string[]): string {
  return path[0] + path.slice(1).map(p => `[${p}]`).join('');
}

// `prefix` nests fields under an Account-object field (e.g. 'individual'
// for a business_type=individual Account). Pass '' for a top-level Person
// (used for a company's representative, posted to /accounts/{id}/persons,
// whose fields are NOT nested under anything).
function personParams(prefix: string, p: PersonInput, country: PayoutCountry, email?: string): Record<string, string> {
  const path = (...segments: string[]) => nest(prefix ? [prefix, ...segments] : segments);
  const params: Record<string, string> = {
    [path('first_name')]: p.firstName,
    [path('last_name')]: p.lastName,
    [path('dob', 'day')]: String(p.dob.day),
    [path('dob', 'month')]: String(p.dob.month),
    [path('dob', 'year')]: String(p.dob.year),
    [path('address', 'line1')]: p.address.line1,
    [path('address', 'city')]: p.address.city,
    [path('address', 'state')]: p.address.province,
    [path('address', 'postal_code')]: p.address.postalCode,
    [path('address', 'country')]: country,
  };
  if (p.phone) params[path('phone')] = p.phone;
  if (p.idNumber) params[path('id_number')] = p.idNumber;
  if (p.ssnLast4) params[path('ssn_last_4')] = p.ssnLast4;
  if (email) params[path('email')] = email;
  return params;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const body = await req.json();
    const { userId, stepUpToken, country, accountHolderType, individual, company, action } = body as {
      userId?: string; stepUpToken?: string; country?: PayoutCountry; accountHolderType?: 'individual' | 'company';
      individual?: PersonInput; company?: { name: string; address: PersonInput['address']; phone?: string; representative: PersonInput };
      action?: 'reset';
    };
    if (!userId) return json({ error: 'Missing required fields' }, 400);

    // Abandon whatever account is currently referenced and let the next
    // setup attempt create a brand-new one -- e.g. switching from
    // Registered Business to Individual after already starting a company
    // account, which can't just be edited into a different business_type
    // once it has requirements/capabilities attached. Deletes the Stripe
    // side too (best-effort) so an incomplete test account doesn't linger
    // in the Connect accounts list.
    if (action === 'reset') {
      const validStepUp = await verifyStepUpToken(stepUpToken || '', userId, PURPOSE);
      if (!validStepUp) return json({ error: 'Please verify your identity again — this took too long.' }, 401);
      const profile = await selectOne('profiles', `id=eq.${userId}`);
      const staleAccountId = profile?.stripe_connect_account_id as string | undefined;
      const SK = Deno.env.get('STRIPE_SECRET_KEY');
      if (staleAccountId && SK) {
        await fetch(`https://api.stripe.com/v1/accounts/${staleAccountId}`, {
          method: 'DELETE', headers: { Authorization: `Bearer ${SK}` },
        }).catch(() => {});
      }
      await fetch(rest(`/profiles?id=eq.${userId}`), {
        method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
        body: JSON.stringify({ stripe_connect_account_id: null, stripe_connect_country: null, payout_account_type: null }),
      });
      await fetch(rest(`/payout_methods?host_id=eq.${userId}&stripe_connect_account_id=eq.${staleAccountId}`), {
        method: 'DELETE', headers: H,
      }).catch(() => {});
      return json({ success: true });
    }

    if (!accountHolderType) return json({ error: 'Missing required fields' }, 400);
    if (accountHolderType === 'individual' && !individual) return json({ error: 'Missing individual details' }, 400);
    if (accountHolderType === 'company' && !company) return json({ error: 'Missing company details' }, 400);

    const validStepUp = await verifyStepUpToken(stepUpToken || '', userId, PURPOSE);
    if (!validStepUp) return json({ error: 'Please verify your identity again — this took too long.' }, 401);

    const profile = await selectOne('profiles', `id=eq.${userId}`);
    if (!profile) return json({ error: 'Account not found' }, 404);

    // The account's country is fixed at creation and never re-asked after
    // that -- an existing connected account is authoritative over whatever
    // the client sends on a later call (e.g. resolving a follow-up
    // requirement), so payouts can never be silently moved to an
    // unsupported country by a stale/tampered client request.
    const resolvedCountry: PayoutCountry | undefined = (profile.stripe_connect_country as PayoutCountry) || country;
    if (!resolvedCountry || !SUPPORTED_COUNTRIES.includes(resolvedCountry)) {
      return json({ error: 'Payouts are currently only available for Canadian or U.S. bank accounts' }, 400);
    }

    const SK = Deno.env.get('STRIPE_SECRET_KEY');
    if (!SK) return json({ error: 'Stripe not configured' }, 500);
    const stripeHeaders = { Authorization: `Bearer ${SK}`, 'Content-Type': 'application/x-www-form-urlencoded' };

    let accountId = profile.stripe_connect_account_id as string | null;
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || '0.0.0.0';

    // `country` is a create-only, immutable Account field -- Stripe's
    // update endpoint (POST /v1/accounts/{id}) doesn't recognize it at all
    // and returns "Unknown parameter: country" if it's included, so it's
    // added below only for the create branch, never reused here for the
    // update call (e.g. the SIN/SSN follow-up step re-submits against an
    // account that already exists by then).
    const baseParams: Record<string, string> = {
      business_type: accountHolderType,
      email: profile.email || '',
      'capabilities[transfers][requested]': 'true',
      'capabilities[card_payments][requested]': 'true', // required alongside transfers, see payout-connect-start's old comment for why -- never actually used to charge anything
    };
    if (accountHolderType === 'individual') {
      Object.assign(baseParams, personParams('individual', individual!, resolvedCountry, profile.email));
    } else {
      baseParams['company[name]'] = company!.name;
      baseParams['company[address][line1]'] = company!.address.line1;
      baseParams['company[address][city]'] = company!.address.city;
      baseParams['company[address][state]'] = company!.address.province;
      baseParams['company[address][postal_code]'] = company!.address.postalCode;
      baseParams['company[address][country]'] = resolvedCountry;
      if (company!.phone) baseParams['company[phone]'] = company!.phone;
    }

    async function createFreshAccount() {
      const createParams = { ...baseParams };
      createParams.country = resolvedCountry!;
      // Newer Stripe platforms default a new account's `controller` to
      // requirement_collection: 'stripe' (Stripe manages onboarding/ToS
      // itself -- the Express/Standard model) regardless of the legacy
      // `type: 'custom'` param, which this platform's Connect settings
      // evidently don't imply on their own. Setting these explicitly is
      // what actually makes it a platform-controlled ("Custom"-equivalent)
      // account: the platform collects requirements and accepts ToS on the
      // account's behalf (what tos_acceptance below needs), is liable for
      // negative balances, pays Stripe's fees, and the account gets no
      // Stripe-hosted dashboard of its own. (controller[type] is NOT a
      // writable param -- Stripe rejects it with "Unknown parameter" -- it's
      // a computed/response-only field derived from these sub-fields.)
      createParams['controller[requirement_collection]'] = 'application';
      createParams['controller[losses][payments]'] = 'application';
      createParams['controller[fees][payer]'] = 'application';
      createParams['controller[stripe_dashboard][type]'] = 'none';
      createParams['tos_acceptance[date]'] = String(Math.floor(Date.now() / 1000));
      createParams['tos_acceptance[ip]'] = ip;
      const res = await fetch('https://api.stripe.com/v1/accounts', {
        method: 'POST', headers: stripeHeaders, body: new URLSearchParams(createParams),
      });
      return res.json();
    }

    let account: any;
    if (!accountId) {
      account = await createFreshAccount();
      if (account.error) return json({ error: account.error.message }, 400);
      accountId = account.id;
      await fetch(rest(`/profiles?id=eq.${userId}`), {
        method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
        body: JSON.stringify({ stripe_connect_account_id: accountId, stripe_connect_country: resolvedCountry, payout_account_type: accountHolderType }),
      });
    } else {
      const res = await fetch(`https://api.stripe.com/v1/accounts/${accountId}`, {
        method: 'POST', headers: stripeHeaders, body: new URLSearchParams(baseParams),
      });
      account = await res.json();
      // React to the specific failure rather than predicting it upfront --
      // an earlier version tried to detect a stale/wrong-type account via
      // a GET beforehand, but the type/controller heuristic it checked
      // didn't reliably match what Stripe actually returns for accounts
      // created via the newer controller[...] params, so it false-flagged
      // every freshly created account as invalid on its very next call
      // (e.g. the SIN/SSN follow-up step) and looped hosts back to
      // "start again" every time. Stripe's own error message is the
      // authoritative signal: a leftover Express-style account (from
      // before this session's Custom-account rewrite) or one that's been
      // deleted/is in the wrong mode surfaces "not authorized to edit" or
      // "No such account" specifically -- only those get retried as a
      // fresh account; any other error (e.g. a bad field value) still
      // surfaces directly so the user can fix it.
      if (account.error && /not authorized to edit|no such account/i.test(account.error.message)) {
        account = await createFreshAccount();
        if (account.error) return json({ error: account.error.message }, 400);
        accountId = account.id;
        await fetch(rest(`/profiles?id=eq.${userId}`), {
          method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
          body: JSON.stringify({ stripe_connect_account_id: accountId, stripe_connect_country: resolvedCountry, payout_account_type: accountHolderType }),
        });
      } else if (account.error) {
        return json({ error: account.error.message }, 400);
      }
    }

    // Company accounts need a representative Person -- posted as a
    // separate call (Stripe has no top-level `individual` object once
    // business_type is 'company').
    if (accountHolderType === 'company') {
      const repParams = personParams('', company!.representative, resolvedCountry, profile.email);
      repParams['relationship[representative]'] = 'true';
      const personRes = await fetch(`https://api.stripe.com/v1/accounts/${accountId}/persons`, {
        method: 'POST', headers: stripeHeaders, body: new URLSearchParams(repParams),
      });
      const person = await personRes.json();
      if (person.error) return json({ error: person.error.message }, 400);
    }

    const requirementsDue: string[] = account.requirements?.currently_due || [];
    return json({ success: true, accountId, requirementsDue });
  } catch (e) {
    console.error('setup-payout-account error:', e);
    return json({ error: 'Internal error' }, 500);
  }
});
