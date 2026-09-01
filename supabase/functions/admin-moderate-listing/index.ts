// Admin-only moderation of a listing (or opportunity -- opportunities
// are listings with listing_type='opportunity', same table, same
// action). Separate from delete-listing (owner-authenticated, checks
// listing.user_id === userId) -- this checks the admin session instead
// and writes to moderation_status, a column the owner's own toggle
// never touches. Every action is audited to listing_moderation_log.
import { verifyAdminToken } from '../_shared/adminAuth.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY };
function rest(path: string) { return `${SUPABASE_URL}/rest/v1${path}`; }

const ACTIONS = { pause: 'paused', restore: 'active', remove: 'removed' } as const;
type Action = keyof typeof ACTIONS;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const admin = await verifyAdminToken(req);
  if (!admin) return json({ error: 'Unauthorized' }, 401);

  try {
    const { listingId, action, reason } = await req.json() as { listingId?: string; action?: Action; reason?: string };
    if (!listingId || !action || !(action in ACTIONS)) {
      return json({ error: 'Missing listingId or invalid action' }, 400);
    }
    if ((action === 'pause' || action === 'remove') && !reason?.trim()) {
      return json({ error: 'A reason is required' }, 400);
    }

    const patchRes = await fetch(rest(`/listings?id=eq.${listingId}`), {
      method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({ moderation_status: ACTIONS[action], updated_at: new Date().toISOString() }),
    });
    if (!patchRes.ok) {
      console.error('admin-moderate-listing: patch failed', patchRes.status, await patchRes.text());
      return json({ error: 'Could not update listing' }, 500);
    }

    const logAction = action === 'pause' ? 'paused' : action === 'restore' ? 'restored' : 'removed';
    await fetch(rest('/listing_moderation_log'), {
      method: 'POST', headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({ listing_id: listingId, admin_identifier: admin.name, action: logAction, reason: reason?.trim() || null }),
    });

    return json({ success: true });
  } catch (e) {
    console.error('admin-moderate-listing error:', e);
    return json({ error: 'Internal error' }, 500);
  }
});
