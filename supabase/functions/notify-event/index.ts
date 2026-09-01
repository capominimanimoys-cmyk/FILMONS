// Small generic notifier for a few one-off events that don't fit the
// per-feature edge functions elsewhere (record-swipe, send-message-
// notification, etc.): a listing being liked, a followed creator posting a
// new listing, and a new support case. Each branch looks up whatever
// recipient info it needs fresh from `profiles` server-side rather than
// trusting it from the client.
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
async function selectMany(table: string, filter: string) {
  const res = await fetch(rest(`/${table}?${filter}`), { headers: H });
  const rows = await res.json();
  return Array.isArray(rows) ? rows : [];
}

import { sendListingLikedEmail, sendCreatorLikedEmail, sendFollowedCreatorPostedEmail, sendSupportCaseAdminEmail } from '../_shared/notificationEmails.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const body = await req.json();
    const { type } = body;

    if (type === 'listing_liked') {
      const { ownerId, likerId, likerName, listingId, listingTitle } = body;
      if (!ownerId || ownerId === likerId) return json({ sent: false });
      const owner = await selectOne('profiles', `id=eq.${ownerId}`);
      if (!owner?.email) return json({ sent: false, reason: 'no_email' });
      await sendListingLikedEmail({ toEmail: owner.email, toName: owner.name, fromName: likerName || 'Someone', listingId, listingTitle });
      return json({ sent: true });
    }

    if (type === 'creator_liked') {
      const { ownerId, likerId, likerName } = body;
      if (!ownerId || ownerId === likerId) return json({ sent: false });
      const owner = await selectOne('profiles', `id=eq.${ownerId}`);
      if (!owner?.email) return json({ sent: false, reason: 'no_email' });
      await sendCreatorLikedEmail({ toEmail: owner.email, toName: owner.name, fromName: likerName || 'Someone' });
      return json({ sent: true });
    }

    if (type === 'followed_creator_posted') {
      const { creatorId, creatorName, listingId, listingTitle } = body;
      if (!creatorId || !listingId) return json({ error: 'Missing fields' }, 400);
      // Cap fan-out to the most recent 50 followers -- fire-and-forget from
      // the caller, not meant to scale to a mass broadcast today.
      const follows = await selectMany('follows', `following_id=eq.${creatorId}&select=follower_id&order=created_at.desc&limit=50`);
      const followerIds: string[] = follows.map((f: any) => f.follower_id);
      let sent = 0;
      for (const followerId of followerIds) {
        if (followerId === creatorId) continue;
        const follower = await selectOne('profiles', `id=eq.${followerId}`);
        if (!follower?.email) continue;
        await sendFollowedCreatorPostedEmail({ toEmail: follower.email, toName: follower.name, fromName: creatorName || 'A creator you follow', listingId, listingTitle });
        sent++;
      }
      return json({ sent, of: followerIds.length });
    }

    if (type === 'support_case_admin') {
      const { caseId, userId, category, message } = body;
      if (!caseId || !userId) return json({ error: 'Missing fields' }, 400);
      const [user, supportCase] = await Promise.all([
        selectOne('profiles', `id=eq.${userId}`),
        selectOne('support_cases', `id=eq.${caseId}`),
      ]);
      await sendSupportCaseAdminEmail({
        caseId, caseNumber: supportCase?.case_number || caseId,
        userName: user?.name || 'Unknown user', userEmail: user?.email,
        category: category || 'general', message: message || '(no message)',
        submittedAt: new Date().toISOString(),
      });
      return json({ sent: true });
    }

    return json({ error: 'Unknown type' }, 400);
  } catch (e) {
    console.error('notify-event error:', e);
    return json({ error: 'Internal error' }, 500);
  }
});
