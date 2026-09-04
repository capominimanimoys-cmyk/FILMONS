// Server-verified Opportunity swipe recording -- Guest/Creator/Creator+
// only, per-tier daily limit (see ENTITLEMENTS.opportunityQueueDaily/
// GUEST_OPPORTUNITY_QUEUE_DAILY in _shared/entitlements.ts), same "tier
// resolved fresh from profiles, never trusted from the client" model as
// record-swipe. Professional/Business never call this (Home.tsx never
// sizes their deck against it, so no swipe of theirs is ever blocked here).
import { normalizeTier, ENTITLEMENTS, GUEST_OPPORTUNITY_QUEUE_DAILY } from '../_shared/entitlements.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

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
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const { userKey, listingId, isGuest } = await req.json();
    if (!userKey || !listingId) return json({ error: 'Missing required fields' }, 400);

    let dailyLimit = GUEST_OPPORTUNITY_QUEUE_DAILY;
    if (!isGuest) {
      const profile = await selectOne('profiles', `id=eq.${userKey}`);
      const tier = normalizeTier(profile?.account_type);
      // Professional/Business never call this endpoint from the client,
      // but fail open to "unlimited" here too rather than a wrong number
      // if one somehow does.
      dailyLimit = ENTITLEMENTS[tier].opportunityQueueDaily ?? Number.MAX_SAFE_INTEGER;
    }

    const res = await fetch(rest('/rpc/fn_record_opportunity_swipe'), {
      method: 'POST', headers: H,
      body: JSON.stringify({ p_user_key: userKey, p_listing_id: listingId, p_limit: dailyLimit }),
    });
    if (!res.ok) {
      console.error('fn_record_opportunity_swipe failed:', res.status, await res.text());
      return json({ error: 'Could not record swipe' }, 500);
    }
    const rows = await res.json().catch(() => []);
    const row = Array.isArray(rows) ? rows[0] : rows;
    return json({ swipeCount: row?.swipe_count ?? 0, allowed: !!row?.allowed, limit: dailyLimit });
  } catch (e) {
    console.error('record-opportunity-swipe error:', e);
    return json({ error: 'Internal error' }, 500);
  }
});
