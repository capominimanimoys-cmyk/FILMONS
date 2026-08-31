// Server-verified Opportunity swipe recording -- Guest/Creator/Creator+
// only, 5/day, same "tier resolved fresh from profiles, never trusted
// from the client" model as record-swipe. Professional/Business never
// call this (Home.tsx never sizes their deck against it, so no swipe of
// theirs is ever blocked here).
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY };
function rest(path: string) { return `${SUPABASE_URL}/rest/v1${path}`; }

const DAILY_LIMIT = 5;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const { userKey, listingId } = await req.json();
    if (!userKey || !listingId) return json({ error: 'Missing required fields' }, 400);

    const res = await fetch(rest('/rpc/fn_record_opportunity_swipe'), {
      method: 'POST', headers: H,
      body: JSON.stringify({ p_user_key: userKey, p_listing_id: listingId, p_limit: DAILY_LIMIT }),
    });
    if (!res.ok) {
      console.error('fn_record_opportunity_swipe failed:', res.status, await res.text());
      return json({ error: 'Could not record swipe' }, 500);
    }
    const rows = await res.json().catch(() => []);
    const row = Array.isArray(rows) ? rows[0] : rows;
    return json({ swipeCount: row?.swipe_count ?? 0, allowed: !!row?.allowed, limit: DAILY_LIMIT });
  } catch (e) {
    console.error('record-opportunity-swipe error:', e);
    return json({ error: 'Internal error' }, 500);
  }
});
