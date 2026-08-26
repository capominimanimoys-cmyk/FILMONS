// Sends the "new follower" email immediately when a follow happens.
// Mirrors send-message-notification's shape: server-side send (private
// key never touches the client), gated on the recipient's real
// notif_new_followers toggle (the only real column for this -- there is
// no separate email_new_followers column, same situation notif_dms was
// in for messages).
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

import { sendNewFollowerEmail } from '../_shared/notificationEmails.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const { followedId, followerId, followerName, followerUsername } = await req.json();
    if (!followedId || !followerId) return json({ error: 'Missing required fields' }, 400);
    if (followedId === followerId) return json({ sent: false, reason: 'self' });

    const followed = await selectOne('profiles', `id=eq.${followedId}`);
    if (!followed?.email) return json({ sent: false, reason: 'no_email' });

    const settings = await selectOne('notification_settings', `user_id=eq.${followedId}`);
    if (settings?.notif_new_followers === false) return json({ sent: false, reason: 'disabled' });

    await sendNewFollowerEmail({
      toEmail: followed.email, toName: followed.name || followed.username,
      followerName: followerName || 'Someone', followerUsername,
    });

    return json({ sent: true });
  } catch (e) {
    console.error('send-follow-notification error:', e);
    return json({ error: 'Internal error' }, 500);
  }
});
