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

interface PersonInput {
  firstName: string; lastName: string;
  dob: { day: number; month: number; year: number };
  address: { line1: string; city: string; province: string; postalCode: string };
  phone?: string;
  idNumber?: string; // only ever sent when Stripe actually asked for it (individual.id_number)
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
function personParams(prefix: string, p: PersonInput, email?: string): Record<string, string> {
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
    [path('address', 'country')]: 'CA',
  };
  if (p.phone) params[path('phone')] = p.phone;
  if (p.idNumber) params[path('id_number')] = p.idNumber;
  if (email) params[path('email')] = email;
  return params;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const { userId, stepUpToken, accountHolderType, individual, company } = await req.json() as {
      userId?: string; stepUpToken?: string; accountHolderType?: 'individual' | 'company';
      individual?: PersonInput; company?: { name: string; address: PersonInput['address']; phone?: string; representative: PersonInput };
    };
    if (!userId || !accountHolderType) return json({ error: 'Missing required fields' }, 400);
    if (accountHolderType === 'individual' && !individual) return json({ error: 'Missing individual details' }, 400);
    if (accountHolderType === 'company' && !company) return json({ error: 'Missing company details' }, 400);

    const validStepUp = await verifyStepUpToken(stepUpToken || '', userId, PURPOSE);
    if (!validStepUp) return json({ error: 'Please verify your identity again — this took too long.' }, 401);

    const profile = await selectOne('profiles', `id=eq.${userId}`);
    if (!profile) return json({ error: 'Account not found' }, 404);

    const SK = Deno.env.get('STRIPE_SECRET_KEY');
    if (!SK) return json({ error: 'Stripe not configured' }, 500);
    const stripeHeaders = { Authorization: `Bearer ${SK}`, 'Content-Type': 'application/x-www-form-urlencoded' };

    let accountId = profile.stripe_connect_account_id as string | null;
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || '0.0.0.0';

    const baseParams: Record<string, string> = {
      business_type: accountHolderType,
      country: 'CA',
      email: profile.email || '',
      'capabilities[transfers][requested]': 'true',
      'capabilities[card_payments][requested]': 'true', // required alongside transfers, see payout-connect-start's old comment for why -- never actually used to charge anything
    };
    if (accountHolderType === 'individual') {
      Object.assign(baseParams, personParams('individual', individual!, profile.email));
    } else {
      baseParams['company[name]'] = company!.name;
      baseParams['company[address][line1]'] = company!.address.line1;
      baseParams['company[address][city]'] = company!.address.city;
      baseParams['company[address][state]'] = company!.address.province;
      baseParams['company[address][postal_code]'] = company!.address.postalCode;
      baseParams['company[address][country]'] = 'CA';
      if (company!.phone) baseParams['company[phone]'] = company!.phone;
    }

    let account: any;
    if (!accountId) {
      baseParams['tos_acceptance[date]'] = String(Math.floor(Date.now() / 1000));
      baseParams['tos_acceptance[ip]'] = ip;
      const res = await fetch('https://api.stripe.com/v1/accounts', {
        method: 'POST', headers: stripeHeaders, body: new URLSearchParams(baseParams),
      });
      account = await res.json();
      if (account.error) return json({ error: account.error.message }, 400);
      accountId = account.id;
      await fetch(rest(`/profiles?id=eq.${userId}`), {
        method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
        body: JSON.stringify({ stripe_connect_account_id: accountId, stripe_connect_country: 'CA', payout_account_type: accountHolderType }),
      });
    } else {
      const res = await fetch(`https://api.stripe.com/v1/accounts/${accountId}`, {
        method: 'POST', headers: stripeHeaders, body: new URLSearchParams(baseParams),
      });
      account = await res.json();
      if (account.error) return json({ error: account.error.message }, 400);
    }

    // Company accounts need a representative Person -- posted as a
    // separate call (Stripe has no top-level `individual` object once
    // business_type is 'company').
    if (accountHolderType === 'company') {
      const repParams = personParams('', company!.representative, profile.email);
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
