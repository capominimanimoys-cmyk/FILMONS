// Step 2 of the FILMONS Admin passwordless login: verifies the 6-digit
// code (constant-time hash compare against the most recent unused,
// unexpired admin_login_codes row), burns it immediately on success or
// failure-past-the-attempt-limit, and on success mints the signed admin
// session token and sets it as an HttpOnly cookie -- never returned in
// the JSON body, never touched by frontend JS.
import { mintAdminToken, buildSessionCookieHeader } from '../_shared/adminAuth.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
const json = (body: unknown, status = 200, extraHeaders: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, ...extraHeaders, 'Content-Type': 'application/json' } });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const ADMIN_CODE_PEPPER = Deno.env.get('ADMIN_CODE_PEPPER') || '';
function rest(path: string) { return `${SUPABASE_URL}/rest/v1${path}`; }
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY };

const MAX_ATTEMPTS = 5;

async function sha256Hex(input: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(bytes)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!ADMIN_CODE_PEPPER) {
    console.error('admin-verify-code: ADMIN_CODE_PEPPER not configured');
    return json({ error: 'Server misconfigured' }, 500);
  }

  try {
    const { code } = await req.json();
    if (!code || typeof code !== 'string' || !/^\d{6}$/.test(code)) {
      return json({ error: 'Enter the 6-digit code' }, 400);
    }

    const adminRes = await fetch(rest('/admin_users?is_primary=eq.true&active=eq.true&select=id,name,role&limit=1'), { headers: H });
    const adminRows = await adminRes.json();
    const admin = Array.isArray(adminRows) ? adminRows[0] : null;
    if (!admin) return json({ error: 'Server misconfigured' }, 500);

    const codeRes = await fetch(
      rest(`/admin_login_codes?admin_id=eq.${admin.id}&used=eq.false&order=created_at.desc&limit=1&select=*`),
      { headers: H },
    );
    const codeRows = await codeRes.json();
    const row = Array.isArray(codeRows) ? codeRows[0] : null;

    if (!row || new Date(row.expires_at).getTime() < Date.now()) {
      return json({ error: 'Code expired — generate a new one' }, 401);
    }

    const submittedHash = await sha256Hex(`${code}:${ADMIN_CODE_PEPPER}`);
    const isMatch = timingSafeEqual(submittedHash, row.code_hash);

    if (!isMatch) {
      const attempts = (row.attempts || 0) + 1;
      const exhausted = attempts >= MAX_ATTEMPTS;
      await fetch(rest(`/admin_login_codes?id=eq.${row.id}`), {
        method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
        body: JSON.stringify({ attempts, ...(exhausted ? { used: true } : {}) }),
      });
      return json(
        { error: exhausted ? 'Too many incorrect attempts — generate a new code' : 'Incorrect code' },
        401,
      );
    }

    // Single-use: burn the code the moment it's successfully verified,
    // whether or not the subsequent token mint succeeds -- a code must
    // never be replayable.
    await fetch(rest(`/admin_login_codes?id=eq.${row.id}`), {
      method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({ used: true }),
    });

    const token = await mintAdminToken({ adminId: admin.id, name: admin.name, role: admin.role });

    fetch(rest(`/admin_users?id=eq.${admin.id}`), {
      method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({ last_login_at: new Date().toISOString() }),
    }).catch(() => {});

    return json({ success: true, name: admin.name, role: admin.role }, 200, {
      'Set-Cookie': buildSessionCookieHeader(token),
    });
  } catch (e) {
    console.error('admin-verify-code error:', e);
    return json({ error: 'Internal error' }, 500);
  }
});
