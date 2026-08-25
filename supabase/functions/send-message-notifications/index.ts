// Cron-driven (every 5 min, see .github/workflows/send-message-notifications.yml)
// replacement for messageNotification.ts's old client-side setTimeout(5min)
// email scheduling. That approach only fired if the sender's browser tab
// stayed open and idle for the full 5 minutes -- closing the tab or the
// mobile browser backgrounding it silently lost the timer, so the
// recipient's email never went out. Rows are now written to
// pending_message_notifications immediately when a message is sent
// (survives whatever the sender does next), and this function picks up
// due, unsent ones.
//
// Two of the original client-side gates were quietly dead code and are NOT
// reproduced here: conversationIsRead() queried conversation_participants,
// which has zero rows in production (nothing in this app ever writes to
// it -- "read" state lives in localStorage only), so it always evaluated
// to "not read" and never actually skipped a send. emailEnabledForKind()
// checked per-kind columns (email_new_messages, email_booking_inquiries,
// etc.) that don't exist in notification_settings' real schema (see
// NotificationSettings.tsx -- only notif_dms is real for this feature);
// those checks always fell through to "enabled". The one gate that was
// ever real -- notif_dms === false -- is kept below.
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
async function updateOne(table: string, filter: string, patch: Record<string, unknown>) {
  await fetch(rest(`/${table}?${filter}`), {
    method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  }).catch(() => {});
}

import { sendNewMessageEmail, type MessageKind } from '../_shared/notificationEmails.ts';

const ONLINE_TTL_MS = 3 * 60 * 1000;
const SPAM_TTL_MS   = 60 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const res = await fetch(
      rest(`/pending_message_notifications?sent_at=is.null&skipped_at=is.null&send_after=lte.${new Date().toISOString()}&select=*&limit=200`),
      { headers: H },
    );
    const due: any[] = await res.json();
    if (!Array.isArray(due) || !due.length) return json({ processed: 0 });

    let sent = 0, skipped = 0;

    for (const row of due) {
      try {
        const receiver = await selectOne('profiles', `id=eq.${row.receiver_id}`);
        if (!receiver?.email) { await updateOne('pending_message_notifications', `id=eq.${row.id}`, { skipped_at: new Date().toISOString() }); skipped++; continue; }

        const online = receiver.last_seen && (Date.now() - new Date(receiver.last_seen).getTime() < ONLINE_TTL_MS);
        if (online) { await updateOne('pending_message_notifications', `id=eq.${row.id}`, { skipped_at: new Date().toISOString() }); skipped++; continue; }

        const settings = await selectOne('notification_settings', `user_id=eq.${row.receiver_id}`);
        if (settings?.notif_dms === false) { await updateOne('pending_message_notifications', `id=eq.${row.id}`, { skipped_at: new Date().toISOString() }); skipped++; continue; }

        // Rate limit: at most one of these emails per receiver+conversation per hour.
        const recentSentRes = await fetch(
          rest(`/pending_message_notifications?receiver_id=eq.${row.receiver_id}&conversation_id=eq.${encodeURIComponent(row.conversation_id)}&sent_at=gt.${new Date(Date.now() - SPAM_TTL_MS).toISOString()}&select=id&limit=1`),
          { headers: H },
        );
        const recentSent = await recentSentRes.json();
        if (Array.isArray(recentSent) && recentSent.length) { await updateOne('pending_message_notifications', `id=eq.${row.id}`, { skipped_at: new Date().toISOString() }); skipped++; continue; }

        await sendNewMessageEmail({
          toEmail: receiver.email, toName: receiver.name || receiver.username,
          fromName: row.sender_name, messagePreview: row.message_preview,
          conversationId: row.conversation_id, kind: row.kind as MessageKind,
          listingTitle: row.listing_title,
        });
        await updateOne('pending_message_notifications', `id=eq.${row.id}`, { sent_at: new Date().toISOString() });
        sent++;
      } catch (e) {
        console.error('send-message-notifications row error:', row.id, e);
        await updateOne('pending_message_notifications', `id=eq.${row.id}`, { skipped_at: new Date().toISOString() });
        skipped++;
      }
    }

    return json({ processed: due.length, sent, skipped });
  } catch (e) {
    console.error('send-message-notifications error:', e);
    return json({ error: 'Internal error' }, 500);
  }
});
