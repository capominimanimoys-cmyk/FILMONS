// Step 1 of the FILMONS Admin passwordless login: generates a
// cryptographically random 6-digit code, stores only its salted/peppered
// SHA-256 hash (never the raw code) with a 10-minute expiry, invalidates
// any still-unused earlier code for the same admin, and emails the code
// to a single fixed address -- never returned in this function's own
// response, never logged, never in a URL.
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const ADMIN_CODE_PEPPER = Deno.env.get('ADMIN_CODE_PEPPER') || '';
function rest(path: string) { return `${SUPABASE_URL}/rest/v1${path}`; }
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY };

// Fixed by design -- the spec is explicit that the code goes to exactly
// one address, not a configurable/admin-selectable recipient.
const ADMIN_RECIPIENT_EMAIL = 'gabriel@filmons.app';
const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 45 * 1000;

const EMAILJS_SERVICE_ID = 'service_s6wwjtj';
const EMAILJS_PUBLIC_KEY = 'iSSpIM-AeV9uUQ7Jt';
const EMAILJS_PRIVATE_KEY = Deno.env.get('EMAILJS_PRIVATE_KEY') || '';
const EMAILJS_TEMPLATE_ADMIN_NOTIFICATION = 'template_rd3nhik';

async function sha256Hex(input: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(bytes)).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!ADMIN_CODE_PEPPER) {
    console.error('admin-generate-code: ADMIN_CODE_PEPPER not configured');
    return json({ error: 'Server misconfigured' }, 500);
  }

  try {
    const adminRes = await fetch(rest('/admin_users?is_primary=eq.true&active=eq.true&select=id,name,role&limit=1'), { headers: H });
    const adminRows = await adminRes.json();
    const admin = Array.isArray(adminRows) ? adminRows[0] : null;
    if (!admin) {
      console.error('admin-generate-code: no primary admin_users row found');
      return json({ error: 'Server misconfigured' }, 500);
    }

    // Rate limit: refuse a new code while a very recent one is still
    // outstanding, rather than letting Generate Code be spammed.
    const recentRes = await fetch(
      rest(`/admin_login_codes?admin_id=eq.${admin.id}&order=created_at.desc&limit=1&select=created_at`),
      { headers: H },
    );
    const recentRows = await recentRes.json();
    const lastCreatedAt = Array.isArray(recentRows) && recentRows[0] ? new Date(recentRows[0].created_at).getTime() : 0;
    if (Date.now() - lastCreatedAt < RESEND_COOLDOWN_MS) {
      return json({ error: 'Please wait a moment before requesting another code' }, 429);
    }

    // A fresh code invalidates any still-unused earlier one for this admin.
    await fetch(rest(`/admin_login_codes?admin_id=eq.${admin.id}&used=eq.false`), {
      method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({ used: true }),
    });

    const code = Array.from(crypto.getRandomValues(new Uint32Array(1)))[0] % 1_000_000;
    const codeStr = String(code).padStart(6, '0');
    const codeHash = await sha256Hex(`${codeStr}:${ADMIN_CODE_PEPPER}`);

    const insertRes = await fetch(rest('/admin_login_codes'), {
      method: 'POST', headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({
        admin_id: admin.id, code_hash: codeHash,
        expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
      }),
    });
    if (!insertRes.ok) {
      console.error('admin-generate-code: insert failed:', await insertRes.text());
      return json({ error: 'Could not generate code' }, 500);
    }

    try {
      const emailRes = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: EMAILJS_SERVICE_ID,
          template_id: EMAILJS_TEMPLATE_ADMIN_NOTIFICATION,
          user_id: EMAILJS_PUBLIC_KEY,
          accessToken: EMAILJS_PRIVATE_KEY,
          template_params: {
            to_email: ADMIN_RECIPIENT_EMAIL, to_name: admin.name,
            subject: 'FILMONS Admin — your sign-in code',
            message: `Your FILMONS Admin verification code is: ${codeStr}\n\nThis code expires in 10 minutes and can only be used once. If you didn't request this, you can ignore this email.`,
          },
        }),
      });
      if (!emailRes.ok) console.error('admin-generate-code: EmailJS send failed:', emailRes.status, await emailRes.text());
    } catch (e) {
      console.error('admin-generate-code: EmailJS send threw:', e);
    }

    // Deliberately no code, no hash, nothing code-derived in this
    // response -- success only confirms an email was attempted.
    return json({ success: true });
  } catch (e) {
    console.error('admin-generate-code error:', e);
    return json({ error: 'Internal error' }, 500);
  }
});
