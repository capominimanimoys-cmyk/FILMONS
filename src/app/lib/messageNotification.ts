/**
 * messageNotification.ts — Smart external notification for new messages.
 *
 * Priority:
 *   1. In-app push  → immediate  (handled by notifications.ts)
 *   2. Email        → after 5 min if conversation still unread + user offline
 *   3. SMS          → after 10 min if still unread (phone-only / both)
 */
import { EMAILJS_CONFIG } from './emailjs-config';
import { sendSMS } from './sms';
import { supabase } from '../../lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Receiver { id: string; name: string; username?: string; email?: string; phone?: string; }
interface Sender   { id: string; name: string; username?: string; }

// ── Timing ───────────────────────────────────────────────────────────────────

const EMAIL_DELAY = 5  * 60 * 1000;
const SMS_DELAY   = 10 * 60 * 1000;
const ONLINE_TTL  = 3  * 60 * 1000;  // online if last_seen < 3 min
const SPAM_TTL    = 60 * 60 * 1000;  // 1 email / conversation / hour

// ── Anti-spam ─────────────────────────────────────────────────────────────────

const spamKey = (uid: string, cid: string, ch: string) =>
  `filmons_notif_${ch}_${uid}_${cid}`;

function canSend(uid: string, cid: string, ch: 'email' | 'sms'): boolean {
  try {
    const ts = localStorage.getItem(spamKey(uid, cid, ch));
    return !ts || Date.now() - Number(ts) > SPAM_TTL;
  } catch { return true; }
}

function markSent(uid: string, cid: string, ch: 'email' | 'sms') {
  try { localStorage.setItem(spamKey(uid, cid, ch), String(Date.now())); } catch {}
}

// ── Supabase checks ───────────────────────────────────────────────────────────

async function receiverIsOnline(uid: string): Promise<boolean> {
  try {
    const { data } = await supabase.from('profiles').select('last_seen').eq('id', uid).maybeSingle();
    if (!data?.last_seen) return false;
    return Date.now() - new Date(data.last_seen).getTime() < ONLINE_TTL;
  } catch { return false; }
}

async function conversationIsRead(convId: string, uid: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('conversation_participants')
      .select('unread_count')
      .eq('conversation_id', convId)
      .eq('user_id', uid)
      .maybeSingle();
    if (data && (data.unread_count ?? 1) === 0) return true;
  } catch {}
  return false;
}

async function loadProfile(uid: string): Promise<Receiver | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, username, email, phone')
      .eq('id', uid)
      .maybeSingle();
    if (error) { console.warn('[msgNotif] profile error:', error.message); return null; }
    if (!data)  { console.warn('[msgNotif] profile not found for', uid); return null; }
    console.log('[msgNotif] profile loaded — email:', data.email || 'MISSING', '| phone:', data.phone || 'MISSING');
    return { id: data.id, name: data.name || data.username || 'User', username: data.username, email: data.email || undefined, phone: data.phone || undefined };
  } catch (e) { console.warn('[msgNotif] profile fetch threw:', e); return null; }
}

async function loadSettings(uid: string): Promise<Record<string, any>> {
  try {
    const { data } = await supabase.from('notification_settings').select('*').eq('user_id', uid).maybeSingle();
    return data || {};
  } catch { return {}; }
}

// ── EmailJS send ──────────────────────────────────────────────────────────────

async function dispatchEmail(receiver: Receiver, sender: Sender, preview: string, convId: string) {
  if (!receiver.email) { console.warn('[msgNotif] no email on receiver profile — skipping'); return; }
  const params = {
    to_email:          receiver.email,
    to_name:           receiver.username || receiver.name,
    from_name:         sender.username   || sender.name,
    message_preview:   preview,
    conversation_link: `${window.location.origin}/inbox?conv=${convId}&with=${sender.id}`,
  };
  console.log('[msgNotif] calling EmailJS with params:', params);
  const emailjs = await import('@emailjs/browser');
  const result = await emailjs.default.send(
    EMAILJS_CONFIG.serviceId,
    EMAILJS_CONFIG.templates.messageNotification,
    params,
    EMAILJS_CONFIG.publicKey,
  );
  console.log('[msgNotif] EmailJS response:', result);
}

// ── SMS send ──────────────────────────────────────────────────────────────────

async function dispatchSMS(receiver: Receiver, sender: Sender, preview: string, convId: string) {
  if (!receiver.phone) return;
  const link = `${window.location.origin}/inbox?conv=${convId}&with=${sender.id}`;
  await sendSMS(receiver.phone, `New Filmons message from ${sender.username || sender.name}: "${preview}"\n${link}`);
  console.log('[msgNotif] SMS dispatched');
}

// ── Immediate email (no delay — for real-time Inbox notifications) ───────────
//
// Anti-spam: 1 email per receiver per conversation per 30 minutes.
// Called from the Inbox Realtime handler when a message arrives for the user.

const IMMEDIATE_SPAM_TTL = 30 * 60 * 1000;

export function notifyImmediateEmail({
  receiverId, receiverEmail, receiverName,
  senderName, senderId, messageText, conversationId, isRequest,
}: {
  receiverId: string;
  receiverEmail: string;
  receiverName: string;
  senderName: string;
  senderId: string;
  messageText: string;
  conversationId: string;
  isRequest: boolean;
}): void {
  if (!receiverEmail) return;
  if (receiverId === senderId) return;

  // Anti-spam guard
  const key = `filmons_notif_imm_${receiverId}_${conversationId}`;
  try {
    const ts = localStorage.getItem(key);
    if (ts && Date.now() - Number(ts) < IMMEDIATE_SPAM_TTL) return;
    localStorage.setItem(key, String(Date.now()));
  } catch {}

  const preview  = (messageText || (isRequest ? 'Message request' : 'New message')).slice(0, 100);
  const subject  = isRequest ? `New message request from ${senderName}` : `New message from ${senderName}`;
  const convLink = `${window.location.origin}/inbox?conv=${conversationId}&with=${senderId}`;

  import('@emailjs/browser').then(async emailjs => {
    try {
      await emailjs.default.send(
        EMAILJS_CONFIG.serviceId,
        EMAILJS_CONFIG.templates.messageNotification,
        {
          to_email:          receiverEmail,
          to_name:           receiverName,
          from_name:         senderName,
          subject,
          message_preview:   preview,
          is_request:        isRequest ? 'yes' : 'no',
          conversation_link: convLink,
        },
        EMAILJS_CONFIG.publicKey,
      );
      console.log('[msgNotif] immediate email sent to', receiverEmail);
    } catch (e) {
      console.warn('[msgNotif] immediate email failed:', e);
    }
  }).catch(() => {});
}

// ── Main entry (synchronous — schedules its own timers) ───────────────────────

export function notifyReceiverForMessage({
  receiverId, sender, messageText, conversationId,
}: {
  receiverId: string; sender: Sender; messageText: string; conversationId: string;
}): void {
  if (receiverId === sender.id) return;

  const preview = (messageText || 'New message').slice(0, 100);

  // ── Email after 5 min ────────────────────────────────────────────────────────
  setTimeout(async () => {
    console.log('[msgNotif] 5-min timer fired — checking email eligibility');
    try {
      if (await receiverIsOnline(receiverId))                             { console.log('[msgNotif] skip email — user online'); return; }
      if (await conversationIsRead(conversationId, receiverId))           { console.log('[msgNotif] skip email — already read'); return; }
      if (!canSend(receiverId, conversationId, 'email'))                  { console.log('[msgNotif] skip email — spam window'); return; }

      const [receiver, settings] = await Promise.all([loadProfile(receiverId), loadSettings(receiverId)]);
      if (!receiver) return;

      const emailEnabled = settings.notif_dms !== false && settings.email_messages !== false;
      console.log('[msgNotif] emailEnabled:', emailEnabled, '| settings:', { notif_dms: settings.notif_dms, email_messages: settings.email_messages });

      if (emailEnabled) {
        await dispatchEmail(receiver, sender, preview, conversationId);
        markSent(receiverId, conversationId, 'email');
      }
    } catch (e) { console.error('[msgNotif] email timer error:', e); }
  }, EMAIL_DELAY);

  // ── SMS after 10 min ─────────────────────────────────────────────────────────
  setTimeout(async () => {
    try {
      if (await receiverIsOnline(receiverId))              return;
      if (await conversationIsRead(conversationId, receiverId)) return;
      if (!canSend(receiverId, conversationId, 'sms'))     return;

      const [receiver, settings] = await Promise.all([loadProfile(receiverId), loadSettings(receiverId)]);
      if (!receiver?.phone) return;

      if (settings.notif_dms !== false && settings.sms_messages === true) {
        await dispatchSMS(receiver, sender, preview, conversationId);
        markSent(receiverId, conversationId, 'sms');
      }
    } catch (e) { console.error('[msgNotif] sms timer error:', e); }
  }, SMS_DELAY);
}
