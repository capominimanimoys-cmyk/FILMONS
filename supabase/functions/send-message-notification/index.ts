// Sends the "new message" email immediately when a message is sent —
// replaces the old two-stage system (client writes a row, a 5-minute cron
// picks it up later, only if the recipient was still offline/unread by
// then). Per explicit request: application-status emails already fire
// immediately with no gate; this makes new-message emails match that,
// even if the recipient is online or reads the message right away.
//
// Still rate-limited to one of these per receiver+conversation per hour
// (pending_message_notifications, now used purely as a sent-log for that
// lookup) and still respects notif_dms — those aren't "delay", they're
// "don't double up" and "the user turned this off", both worth keeping.
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

import { sendNewMessageEmail, sendRentalRequestEmail, sendPurchaseRequestEmail, type MessageKind } from '../_shared/notificationEmails.ts';

const SPAM_TTL_MS = 60 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const {
      receiverId, senderId, senderName, messageText, conversationId,
      kind, listingTitle, listingId, messageId,
      requestType, rentalDates, requestMessage,
    } = await req.json();
    if (!receiverId || !senderId || !conversationId) return json({ error: 'Missing required fields' }, 400);
    if (receiverId === senderId) return json({ sent: false, reason: 'self' });

    const receiver = await selectOne('profiles', `id=eq.${receiverId}`);
    if (!receiver?.email) return json({ sent: false, reason: 'no_email' });

    const settings = await selectOne('notification_settings', `user_id=eq.${receiverId}`);
    if (settings?.notif_dms === false) return json({ sent: false, reason: 'disabled' });

    const recentSentRes = await fetch(
      rest(`/pending_message_notifications?receiver_id=eq.${receiverId}&conversation_id=eq.${encodeURIComponent(conversationId)}&sent_at=gt.${new Date(Date.now() - SPAM_TTL_MS).toISOString()}&select=id&limit=1`),
      { headers: H },
    );
    const recentSent = await recentSentRes.json();
    if (Array.isArray(recentSent) && recentSent.length) return json({ sent: false, reason: 'rate_limited' });

    const preview = (messageText || 'New message').slice(0, 120);
    // Rental/purchase requests get their own dedicated template instead of
    // the generic new-message copy -- same underlying rental_request
    // message type, differentiated by requestType (set client-side from
    // the request's listingMode) so a "Purchase Request" never shows up
    // captioned as a rental, or vice versa.
    if (requestType === 'rental_request') {
      await sendRentalRequestEmail({
        toEmail: receiver.email, toName: receiver.name || receiver.username,
        fromName: senderName || 'Someone', listingTitle: listingTitle || 'your listing',
        rentalDates: rentalDates || 'See conversation for details',
        requestMessage, conversationId,
      });
    } else if (requestType === 'purchase_request') {
      await sendPurchaseRequestEmail({
        toEmail: receiver.email, toName: receiver.name || receiver.username,
        fromName: senderName || 'Someone', listingTitle: listingTitle || 'your listing',
        requestMessage, conversationId,
      });
    } else {
      await sendNewMessageEmail({
        toEmail: receiver.email, toName: receiver.name || receiver.username,
        fromName: senderName || 'Someone', messagePreview: preview,
        conversationId, kind: (kind as MessageKind) || 'direct', listingTitle,
      });
    }

    // Sent-log entry, purely for the rate-limit lookup above — not a queue.
    await fetch(rest('/pending_message_notifications'), {
      method: 'POST', headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({
        message_id: messageId || `msg-${Date.now()}`,
        conversation_id: conversationId,
        receiver_id: receiverId,
        sender_id: senderId,
        sender_name: senderName || 'Someone',
        message_preview: preview,
        kind: kind || 'direct',
        listing_title: listingTitle || null,
        listing_id: listingId || null,
        send_after: new Date().toISOString(),
        sent_at: new Date().toISOString(),
      }),
    }).catch(() => {});

    return json({ sent: true });
  } catch (e) {
    console.error('send-message-notification error:', e);
    return json({ error: 'Internal error' }, 500);
  }
});
