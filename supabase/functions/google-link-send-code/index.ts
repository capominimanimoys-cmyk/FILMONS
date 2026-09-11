// Sends the 6-digit code that proves someone requesting to link a Google
// identity to an EXISTING Filmons account (matched by email, see
// OAuthCallback.tsx) actually controls that account's email inbox. Google
// having verified the email address is not treated as sufficient proof on
// its own — see the linking flow's own comments for why. Only the hash is
// ever stored (see _shared/deviceAuth.ts). This is a dedicated table/flow,
// not a reuse of device_verification_codes, because that flow's success
// path sets a "trusted device" cookie as a side effect we don't want here.
import { hashSecret, randomCode } from '../_shared/deviceAuth.ts';

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

const EMAILJS_SERVICE_ID = 'service_s6wwjtj';
const EMAILJS_PUBLIC_KEY = 'iSSpIM-AeV9uUQ7Jt';
const EMAILJS_PRIVATE_KEY = Deno.env.get('EMAILJS_PRIVATE_KEY') || '';
// Reuses the existing "emailVerification" template (template_p5pgn33) —
// same one signup/device-verification already send through, so no new
// EmailJS dashboard template is needed for the code itself.
const EMAILJS_TEMPLATE_VERIFICATION = 'template_p5pgn33';

async function sendCodeEmail(email: string, name: string, code: string) {
  try {
    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_VERIFICATION,
        user_id: EMAILJS_PUBLIC_KEY,
        accessToken: EMAILJS_PRIVATE_KEY,
        template_params: {
          to_email: email, to_name: name || 'there', user_email: email,
          subject: 'Verify your Filmons account to link Google',
          verification_code: code, expires_in: '10 minutes',
        },
      }),
    });
    if (!res.ok) console.warn('EmailJS google-link email failed:', res.status, await res.text());
  } catch (e) {
    console.warn('EmailJS google-link email threw:', e);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const { profileId, googleUserId } = await req.json();
    if (!profileId || !googleUserId) return json({ error: 'Missing profileId or googleUserId' }, 400);

    const profile = await selectOne('profiles', `id=eq.${profileId}`);
    if (!profile?.email) return json({ error: 'No email on file for this account' }, 400);

    // 60s resend cooldown.
    const recent = await selectOne('google_link_verification_codes', `profile_id=eq.${profileId}&order=created_at.desc`);
    if (recent && Date.now() - new Date(recent.created_at).getTime() < 60_000) {
      const waitMs = 60_000 - (Date.now() - new Date(recent.created_at).getTime());
      return json({ error: 'Please wait before requesting another code', retryInMs: waitMs }, 429);
    }

    // Invalidate any still-open prior codes for this profile.
    await fetch(rest(`/google_link_verification_codes?profile_id=eq.${profileId}&used_at=is.null`), {
      method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({ used_at: new Date().toISOString() }),
    });

    const code = randomCode();
    const codeHash = await hashSecret(code);
    await fetch(rest('/google_link_verification_codes'), {
      method: 'POST', headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({
        profile_id: profileId, google_user_id: googleUserId, code_hash: codeHash,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      }),
    });

    await sendCodeEmail(profile.email, profile.name, code);

    return json({ success: true });
  } catch (e) {
    console.error('google-link-send-code error:', e);
    return json({ error: 'Internal error' }, 500);
  }
});
