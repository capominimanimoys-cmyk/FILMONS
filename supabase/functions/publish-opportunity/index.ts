// Server-verified first-time publish of an Opportunity listing — replaces
// CreateOpportunity.tsx's direct client insert (only for the initial
// publish; editing an already-published listing stays a direct client
// update, since it doesn't consume a new monthly slot). Enforces the
// monthly posting entitlement atomically via fn_publish_opportunity
// (pg_advisory_xact_lock keyed on owner+month). Account tier is looked up
// fresh from `profiles` here, never trusted from the client.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
};
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
    const { userId, row } = await req.json();
    if (!userId || !row || typeof row !== 'object') return json({ error: 'Missing userId or row' }, 400);
    if (row.user_id !== userId) return json({ error: 'row.user_id must match userId' }, 400);

    const profile = await selectOne('profiles', `id=eq.${userId}`);
    if (!profile) return json({ error: 'Profile not found' }, 404);
    const tier = normalizeTier(profile.account_type);
    const limit = ENTITLEMENTS[tier].posts;

    const res = await fetch(rest('/rpc/fn_publish_opportunity'), {
      method: 'POST', headers: H,
      body: JSON.stringify({ p_owner_id: userId, p_limit: limit, p_row: row }),
    });
    const data = await res.json();
    if (!res.ok) {
      const msg = typeof data === 'object' ? (data.message || data.error || '') : String(data);
      if (msg.includes('limit_reached')) return json({ error: 'limit_reached', plan: tier, limit }, 403);
      console.error('fn_publish_opportunity error:', data);
      return json({ error: 'Could not publish opportunity' }, 500);
    }
    return json({ success: true, listing: data });
  } catch (e) {
    console.error('publish-opportunity error:', e);
    return json({ error: 'Internal error' }, 500);
  }
});
