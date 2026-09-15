// Server-verified publish of a Service listing (listing_type === 'service')
// -- replaces CreateListing.tsx's direct client insert ONLY for that
// listing type. Enforces the Service posting entitlement atomically via
// fn_publish_service_listing (pg_advisory_xact_lock keyed on owner), same
// shape as publish-opportunity/index.ts. Guest/Creator/Creator+ = 1
// concurrent active Service max; Professional/Business = unlimited.
// Account tier is looked up fresh from `profiles` here, never trusted from
// the client -- this is what makes the limit real, not just a disabled
// frontend button.
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
    if (row.listing_type !== 'service') return json({ error: 'row.listing_type must be service' }, 400);

    const profile = await selectOne('profiles', `id=eq.${userId}`);
    if (!profile) return json({ error: 'Profile not found' }, 404);
    const tier = normalizeTier(profile.account_type);
    const limit = ENTITLEMENTS[tier].services;

    const res = await fetch(rest('/rpc/fn_publish_service_listing'), {
      method: 'POST', headers: H,
      body: JSON.stringify({ p_owner_id: userId, p_limit: limit, p_row: row }),
    });
    const data = await res.json();
    if (!res.ok) {
      const msg = typeof data === 'object' ? (data.message || data.error || '') : String(data);
      if (msg.includes('limit_reached')) return json({ error: 'limit_reached', plan: tier, limit }, 403);
      console.error('fn_publish_service_listing error:', data);
      return json({ error: 'Could not publish service listing' }, 500);
    }
    return json({ success: true, listing: data });
  } catch (e) {
    console.error('publish-service-listing error:', e);
    return json({ error: 'Internal error' }, 500);
  }
});
