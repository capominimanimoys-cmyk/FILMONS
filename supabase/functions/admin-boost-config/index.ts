// Admin editor for the boost_config singleton row. GET is public-readable
// already via RLS (boost_config select is open), but writes must go
// through a verified admin — same real signed-token model every other
// admin mutation in this app uses (see _shared/adminAuth.ts), not a shared
// password. super_admin only, mirroring how sensitive config elsewhere
// (e.g. support-case-admin-action) restricts by role.
import { verifyAdminToken } from '../_shared/adminAuth.ts';

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

const EDITABLE_FIELDS = [
  'min_daily_budget', 'max_daily_budget', 'min_duration_days', 'max_duration_days',
  'priority_multiplier', 'min_audience_threshold', 'frequency_cap_per_user', 'frequency_cooldown_hours',
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const admin = await verifyAdminToken(req);
  if (!admin) return json({ error: 'Unauthorized' }, 401);

  if (req.method === 'GET') {
    const res = await fetch(rest('/boost_config?id=eq.1&select=*&limit=1'), { headers: H });
    const rows = await res.json();
    return json({ config: Array.isArray(rows) ? rows[0] : null });
  }

  if (req.method === 'POST') {
    if (admin.role !== 'super_admin') return json({ error: 'Only super admins can edit boost config' }, 403);
    try {
      const body = await req.json();
      const patch: Record<string, number> = {};
      for (const f of EDITABLE_FIELDS) {
        if (body[f] !== undefined && body[f] !== null && !Number.isNaN(Number(body[f]))) patch[f] = Number(body[f]);
      }
      if (!Object.keys(patch).length) return json({ error: 'No valid fields to update' }, 400);
      (patch as any).updated_at = new Date().toISOString();

      await fetch(rest('/boost_config?id=eq.1'), {
        method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
        body: JSON.stringify(patch),
      });
      const res = await fetch(rest('/boost_config?id=eq.1&select=*&limit=1'), { headers: H });
      const rows = await res.json();
      return json({ success: true, config: Array.isArray(rows) ? rows[0] : null });
    } catch (e) {
      console.error('admin-boost-config error:', e);
      return json({ error: 'Internal error' }, 500);
    }
  }

  return json({ error: 'Method not allowed' }, 405);
});
