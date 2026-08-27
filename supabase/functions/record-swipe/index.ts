// Server-verified swipe recording for the Home discovery deck --
// enforces the daily Like+Pass limit (Creator 10, Creator+ 25,
// Professional/Business unlimited) so the frontend can never bypass it.
// Same trust model as submit-opportunity-application: tier is looked up
// fresh from `profiles` here, never trusted from the client. "See Listing"
// never calls this endpoint at all, so it never counts against the limit.
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

import { ENTITLEMENTS, normalizeTier } from '../_shared/entitlements.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const { userId, itemId, itemType, direction } = await req.json();
    if (!userId || !itemId || !itemType || !direction) return json({ error: 'Missing required fields' }, 400);
    if (!['listing', 'creator'].includes(itemType)) return json({ error: 'Invalid itemType' }, 400);
    if (!['left', 'right'].includes(direction)) return json({ error: 'Invalid direction' }, 400);

    const profile = await selectOne('profiles', `id=eq.${userId}`);
    if (!profile) return json({ error: 'Profile not found' }, 404);
    const tier = normalizeTier(profile.account_type);
    const limit = ENTITLEMENTS[tier].swipesPerDay;

    const res = await fetch(rest('/rpc/fn_record_swipe'), {
      method: 'POST', headers: H,
      body: JSON.stringify({
        p_user_id: userId, p_item_id: itemId, p_item_type: itemType,
        p_direction: direction, p_limit: limit,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      if (errText.includes('limit_reached')) return json({ error: 'limit_reached', tier, limit }, 403);
      console.error('record-swipe RPC error:', errText);
      return json({ error: 'Could not record swipe' }, 500);
    }

    const row = await res.json();
    return json({ swipe: Array.isArray(row) ? row[0] : row, tier, limit });
  } catch (e) {
    console.error('record-swipe error:', e);
    return json({ error: 'Internal error' }, 500);
  }
});
