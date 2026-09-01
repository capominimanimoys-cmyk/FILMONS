// Admin-only read of admin_users -- that table has zero client-readable
// RLS policy (default-deny for anon/authenticated, service-role only),
// same reasoning as admin-stripe-balance needing the secret key
// server-side: this is the only way the Settings page's Admin Access
// list and "last sign-in" can ever be shown at all.
import { verifyAdminToken } from '../_shared/adminAuth.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY };
function rest(path: string) { return `${SUPABASE_URL}/rest/v1${path}`; }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const admin = await verifyAdminToken(req);
  if (!admin) return json({ error: 'Unauthorized' }, 401);

  try {
    const res = await fetch(
      rest('/admin_users?select=id,name,role,active,created_at,last_login_at&order=created_at.asc'),
      { headers: H },
    );
    const rows = await res.json();
    const admins = Array.isArray(rows) ? rows : [];
    const self = admins.find((a: any) => a.id === admin.adminId) || null;
    return json({ admins, currentAdmin: self });
  } catch (e) {
    console.error('admin-settings-info error:', e);
    return json({ error: 'Internal error' }, 500);
  }
});
