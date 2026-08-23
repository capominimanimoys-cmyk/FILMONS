// Sends (and gates) the 6-digit "new browser" verification code. Only the
// hash is ever stored -- see _shared/deviceAuth.ts. Sent server-side via
// raw EmailJS REST calls (same pattern as request-payout/index.ts's
// notifyHostRequested), never generated or emailed from the client.
import { hashSecret, randomCode, corsHeadersFor } from '../_shared/deviceAuth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY };
function rest(path: string) { return `${SUPABASE_URL}/rest/v1${path}`; }

async function selectOne(table: string, filter: string) {
  const res = await fetch(rest(`/${table}?${filter}&select=*&limit=1`), { headers: H });
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] : null;
}

const EMAILJS_SERVICE_ID = 'service_s6wwjtj';
const EMAILJS_PUBLIC_KEY = 'iSSpIM-AeV9uUQ7Jt';
// ⚠️ Not yet created in the EmailJS dashboard — this email will silently
// fail (best-effort, swallowed) until a template with this exact ID
// exists there, with merge fields: to_email, to_name, code, expires_in.
const EMAILJS_TEMPLATE_DEVICE_VERIFY = 'template_device_verify';

async function sendCodeEmail(email: string, name: string, code: string) {
  try {
    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_DEVICE_VERIFY,
        user_id: EMAILJS_PUBLIC_KEY,
        template_params: {
          to_email: email, to_name: name || 'there',
          subject: 'FILMONS verification code',
          code, expires_in: '10 minutes',
        },
      }),
    });
    if (!res.ok) console.warn('EmailJS device-verify email failed:', res.status, await res.text());
  } catch (e) {
    console.warn('EmailJS device-verify email threw:', e);
  }
}

Deno.serve(async (req) => {
  const cors = corsHeadersFor(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...cors, 'Content-Type': 'application/json' } });

  try {
    const { userId } = await req.json();
    if (!userId) return new Response(JSON.stringify({ error: 'Missing userId' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });

    const profile = await selectOne('profiles', `id=eq.${userId}`);
    if (!profile?.email) return new Response(JSON.stringify({ error: 'No email on file for this account' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });

    // 60s resend cooldown — reject before touching anything else.
    const recent = await selectOne('device_verification_codes', `user_id=eq.${userId}&order=created_at.desc`);
    if (recent && Date.now() - new Date(recent.created_at).getTime() < 60_000) {
      const waitMs = 60_000 - (Date.now() - new Date(recent.created_at).getTime());
      return new Response(JSON.stringify({ error: 'Please wait before requesting another code', retryInMs: waitMs }), { status: 429, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // Invalidate any still-open prior codes for this user.
    await fetch(rest(`/device_verification_codes?user_id=eq.${userId}&used_at=is.null`), {
      method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({ used_at: new Date().toISOString() }),
    });

    const code = randomCode();
    const codeHash = await hashSecret(code);
    await fetch(rest('/device_verification_codes'), {
      method: 'POST', headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({
        user_id: userId, code_hash: codeHash,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      }),
    });

    await sendCodeEmail(profile.email, profile.name, code);

    return new Response(JSON.stringify({ success: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('device-send-code error:', e);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
