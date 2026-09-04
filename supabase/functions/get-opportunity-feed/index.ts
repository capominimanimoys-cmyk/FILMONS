// Today's Opportunity-swipe usage for Home's deck -- Guest/Creator/
// Creator+ can see ALL Opportunity listings (the deck itself is never
// filtered down), but the deck is sized to however many swipes they have
// left today (a per-tier daily limit -- see ENTITLEMENTS.opportunityQueueDaily/
// GUEST_OPPORTUNITY_QUEUE_DAILY), so they can never swipe past it.
// Professional/Business always get { unlimited: true }. Tier is resolved
// from the profiles row here, never trusted from the client -- see
// record-opportunity-swipe for the actual per-swipe enforcement.
import { normalizeTier, ENTITLEMENTS, GUEST_OPPORTUNITY_QUEUE_DAILY } from '../_shared/entitlements.ts';

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
    let dailyLimit = GUEST_OPPORTUNITY_QUEUE_DAILY;
    if (!isGuest) {
      const profile = await selectOne('profiles', `id=eq.${userKey}`);
      const tier = normalizeTier(profile?.account_type);
      unlimited = tier === 'professional' || tier === 'business';
      dailyLimit = ENTITLEMENTS[tier].opportunityQueueDaily ?? dailyLimit;
    }

    if (unlimited) {
      return new Response(JSON.stringify({ unlimited: true, swipeCount: 0, limit: dailyLimit }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const rpcRes = await fetch(rest('/rpc/fn_get_opportunity_swipe_count'), {
      method: 'POST', headers: H,
      body: JSON.stringify({ p_user_key: userKey }),
    });
    if (!rpcRes.ok) {
      console.error('fn_get_opportunity_swipe_count failed:', rpcRes.status, await rpcRes.text());
      return new Response(JSON.stringify({ error: 'Could not resolve swipe count' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    const swipeCount = await rpcRes.json().catch(() => 0);

    return new Response(JSON.stringify({ unlimited: false, swipeCount: Number(swipeCount) || 0, limit: dailyLimit }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('get-opportunity-feed error:', e);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
