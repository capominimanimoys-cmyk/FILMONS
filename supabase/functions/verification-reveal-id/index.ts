// Returns the FULL government ID number for one verification — the only
// path that ever does. The admin list/detail fetch reads from
// identity_verifications_admin_view, which only exposes the last 4 digits;
// this function is the sole way to get the rest, gated to super_admin and
// audit-logged on every reveal (never the number itself, per spec).
import { verifyAdminToken } from '../_shared/adminAuth.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

function rest(path: string) {
  return `${SUPABASE_URL}/rest/v1${path}`;
}
const H = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${SERVICE_KEY}`,
  apikey: SERVICE_KEY,
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  try {
    const admin = await verifyAdminToken(req);
    if (!admin) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (admin.role !== 'super_admin') {
      return new Response(JSON.stringify({ error: 'Only Super Admin can reveal the full ID number' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const { verificationId } = await req.json();
    if (!verificationId) return new Response(JSON.stringify({ error: 'Missing verificationId' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });

    const res = await fetch(rest(`/identity_verifications?id=eq.${verificationId}&select=id,user_id,id_number`), { headers: H });
    const rows = await res.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return new Response(JSON.stringify({ error: 'Verification not found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });

    await fetch(rest('/verification_audit_log'), {
      method: 'POST', headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({
        verification_id: verificationId, user_id: row.user_id,
        admin_identifier: admin.name, action: 'id_number_revealed', detail: null,
      }),
    });

    return new Response(JSON.stringify({ idNumber: row.id_number || null }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('verification-reveal-id error:', e);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
