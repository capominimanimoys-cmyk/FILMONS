// Server-authoritative Opportunity feed for Home and Browse/Search --
// Guest/Creator/Creator+ get at most 5 Opportunity listings per calendar
// day (the same 5 across both surfaces, and across refreshes/new search
// terms/tab switches within the day); Professional/Business are never
// gated. Tier is resolved from the profiles row here, never trusted from
// the client, and the allocation itself lives in
// fn_get_opportunity_allowance (see 20240406000000_opportunity_daily_
// allowance.sql) so a user can't bypass this by only hiding cards in React.
import { normalizeTier } from '../_shared/entitlements.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY };
function rest(path: string) { return `${SUPABASE_URL}/rest/v1${path}`; }

async function selectOne(table: string, filter: string) {
  const res = await fetch(rest(`/${table}?${filter}&select=*&limit=1`), { headers: H });
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) ? rows[0] : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const userKey: string | undefined = body.userKey;
    const isGuest = !!body.isGuest;

    if (!userKey) {
      return new Response(JSON.stringify({ error: 'userKey required' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    let unlimited = false;
    if (!isGuest) {
      const profile = await selectOne('profiles', `id=eq.${userKey}`);
      const tier = normalizeTier(profile?.account_type);
      unlimited = tier === 'professional' || tier === 'business';
    }

    if (unlimited) {
      return new Response(JSON.stringify({ unlimited: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const rpcRes = await fetch(rest('/rpc/fn_get_opportunity_allowance'), {
      method: 'POST', headers: H,
      body: JSON.stringify({ p_user_key: userKey, p_limit: 5 }),
    });
    if (!rpcRes.ok) {
      console.error('fn_get_opportunity_allowance failed:', rpcRes.status, await rpcRes.text());
      return new Response(JSON.stringify({ error: 'Could not resolve allowance' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    const rows: Array<{ listing_id: string }> = await rpcRes.json().catch(() => []);
    const listingIds = rows.map(r => r.listing_id);

    // Just the allocated ids -- the caller already has (or fetches) full
    // listing rows via its normal listingsApi path and its own existing
    // row->Listing mapping, so this never needs to duplicate that mapping
    // or risk drifting out of sync with it.
    return new Response(JSON.stringify({ unlimited: false, listingIds, limitReached: listingIds.length >= 5 }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('get-opportunity-feed error:', e);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
