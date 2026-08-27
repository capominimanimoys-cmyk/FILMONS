// Server-verified Undo for the Home discovery deck (SwipeStack.tsx).
// Professional/Business accounts only -- the account tier used to gate
// this is looked up fresh from `profiles` here, never trusted from the
// client, same trust model as submit-opportunity-application/delete-listing.
// Reverses the single most recent swipe (either direction): marks it
// undone so it's no longer excluded from future deck loads, and if it was
// a right swipe (like/save), also removes the matching `favorites` row so
// "liked" history stays consistent with the swipe being undone.
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

import { normalizeTier } from '../_shared/entitlements.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const { userId } = await req.json();
    if (!userId) return json({ error: 'Missing userId' }, 400);

    const profile = await selectOne('profiles', `id=eq.${userId}`);
    if (!profile) return json({ error: 'Profile not found' }, 404);
    const tier = normalizeTier(profile.account_type);
    if (tier !== 'professional' && tier !== 'business') {
      return json({ error: 'undo_requires_upgrade' }, 403);
    }

    const swipe = await selectOne(
      'swipes',
      `user_id=eq.${userId}&undone=eq.false&order=created_at.desc`,
    );
    if (!swipe) return json({ error: 'no_previous_swipe' }, 404);

    await fetch(rest(`/swipes?id=eq.${swipe.id}`), {
      method: 'PATCH', headers: H,
      body: JSON.stringify({ undone: true }),
    });

    if (swipe.direction === 'right') {
      await fetch(rest(`/favorites?user_id=eq.${userId}&item_id=eq.${swipe.item_id}`), {
        method: 'DELETE', headers: H,
      }).catch(() => {});
    }

    return json({ ok: true, itemId: swipe.item_id, itemType: swipe.item_type, direction: swipe.direction });
  } catch (e) {
    console.error('undo-swipe error:', e);
    return json({ error: 'Internal error' }, 500);
  }
});
