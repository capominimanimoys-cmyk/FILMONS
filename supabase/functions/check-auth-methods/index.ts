// Ground truth for "what auth methods does this email actually have" —
// reads the real auth.users/auth.identities record via Supabase's Admin
// API (service-role only, never callable with the anon key from the
// client). Replaces the old fragile heuristic in authApi.signin that
// guessed "unconfirmed" vs "wrong password" from whether
// supabase.auth.resend() happened to succeed — that guess was wrong for
// Google-only accounts (which have no email/password identity and were
// being misreported as "email not confirmed").
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const { email } = await req.json();
    if (!email) return json({ error: 'Missing email' }, 400);

    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email.toLowerCase())}`, {
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('check-auth-methods admin lookup failed:', data);
      return json({ error: 'Could not check account' }, 500);
    }

    // Different GoTrue versions return either a bare array or { users: [...] }.
    const users = Array.isArray(data) ? data : (data.users || []);
    const match = users.find((u: any) => (u.email || '').toLowerCase() === email.toLowerCase());

    if (!match) return json({ exists: false, providers: [], emailConfirmed: false });

    const providers: string[] = (match.identities || []).map((i: any) => i.provider);
    return json({
      exists: true,
      providers,
      emailConfirmed: !!match.email_confirmed_at,
    });
  } catch (e) {
    console.error('check-auth-methods error:', e);
    return json({ error: 'Internal error' }, 500);
  }
});
