// Verifies a name+password against admin_users (via fn_admin_verify_login,
// which does the bcrypt compare in Postgres through pgcrypto) and, on
// success, mints a signed session token — see _shared/adminAuth.ts. This
// replaces AdminVerifications.tsx's old hardcoded-password client check.
import { mintAdminToken } from '../_shared/adminAuth.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

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
    const { name, password } = await req.json();
    if (!name || !password) {
      return new Response(JSON.stringify({ error: 'Missing name or password' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const res = await fetch(rest('/rpc/fn_admin_verify_login'), {
      method: 'POST', headers: H,
      body: JSON.stringify({ p_name: name, p_password: password }),
    });
    const rows = await res.json();
    const match = Array.isArray(rows) ? rows[0] : null;
    if (!match) {
      return new Response(JSON.stringify({ error: 'Incorrect name or password' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const token = await mintAdminToken({ adminId: match.id, name: match.name, role: match.role });

    fetch(rest(`/admin_users?id=eq.${match.id}`), {
      method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({ last_login_at: new Date().toISOString() }),
    }).catch(() => {});

    return new Response(JSON.stringify({ token, name: match.name, role: match.role }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('admin-login error:', e);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
