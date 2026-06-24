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

export type MessageKind =
  | 'direct'
  | 'request'
  | 'booking_inquiry'
  | 'rental_inquiry'
  | 'marketplace'
  | 'collaboration';

export interface ListingContext {
  id?: string;
  title?: string;
  price?: number;
  location?: string;
}

// ── Timing ───────────────────────────────────────────────────────────────────

const EMAIL_DELAY = 5  * 60 * 1000;
const SMS_DELAY   = 10 * 60 * 1000;
const ONLINE_TTL  = 3  * 60 * 1000;
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
    if (error || !data) return null;
    return { id: data.id, name: data.name || data.username || 'User', username: data.username, email: data.email || undefined, phone: data.phone || undefined };
  } catch { return null; }
}

async function loadSettings(uid: string): Promise<Record<string, any>> {
  try {
    const { data } = await supabase.from('notification_settings').select('*').eq('user_id', uid).maybeSingle();
    return data || {};
  } catch { return {}; }
}

// ── Settings check per message kind ──────────────────────────────────────────

function emailEnabledForKind(settings: Record<string, any>, kind: MessageKind): boolean {
  if (settings.notif_dms === false) return false;
  switch (kind) {
    case 'request':          return settings.email_message_requests    !== false;
    case 'booking_inquiry':  return settings.email_booking_inquiries   !== false;
    case 'rental_inquiry':   return settings.email_rental_inquiries    !== false;
    case 'marketplace':      return settings.email_marketplace_messages !== false;
    case 'collaboration':    return settings.email_collaboration_requests !== false;
    default:                 return settings.email_new_messages        !== false;
  }
}

// ── Subject line per kind ─────────────────────────────────────────────────────

function buildSubject(senderName: string, kind: MessageKind, listing?: ListingContext): string {
  switch (kind) {
    case 'request':         return `New message request from ${senderName}`;
    case 'booking_inquiry': return listing?.title
      ? `New booking inquiry for ${listing.title}`
      : `New booking inquiry from ${senderName}`;
    case 'rental_inquiry':  return listing?.title
      ? `New rental inquiry for ${listing.title}`
      : `New rental inquiry from ${senderName} on Filmons`;
    case 'marketplace':     return listing?.title
      ? `Someone messaged you about ${listing.title}`
      : `New marketplace message from ${senderName}`;
    case 'collaboration':   return `New collaboration request from ${senderName}`;
    default:                return `New message from ${senderName} on Filmons`;
  }
}

// ── EmailJS send ──────────────────────────────────────────────────────────────

async function dispatchEmail(
  receiver: Receiver,
  sender: Sender,
  preview: string,
  convId: string,
  kind: MessageKind,
  listing?: ListingContext,
) {
  if (!receiver.email) return;

  const subject     = buildSubject(sender.username || sender.name, kind, listing);
  const convLink    = `${window.location.origin}/inbox?conv=${convId}&with=${sender.id}`;
  const unsubLink   = `${window.location.origin}/settings/notifications`;
  const settingsUrl = `${window.location.origin}/settings/notifications`;

  const params: Record<string, string> = {
    to_email:          receiver.email,
    to_name:           receiver.username || receiver.name,
    from_name:         sender.username   || sender.name,
    subject,
    message_preview:   preview,
    is_request:        kind === 'request' ? 'yes' : 'no',
    conversation_link: convLink,
    unsubscribe_url:   unsubLink,
    settings_url:      settingsUrl,
    // Listing context (empty strings when absent — template renders nothing)
    listing_title:     listing?.title    || '',
    listing_price:     listing?.price    != null ? `$${listing.price}` : '',
    listing_location:  listing?.location || '',
    listing_id:        listing?.id       || '',
  };

  const emailjs = await import('@emailjs/browser');
  await emailjs.default.send(
    EMAILJS_CONFIG.serviceId,
    EMAILJS_CONFIG.templates.messageNotification,
    params,
    EMAILJS_CONFIG.publicKey,
  );
}

// ── SMS send ──────────────────────────────────────────────────────────────────

async function dispatchSMS(receiver: Receiver, sender: Sender, preview: string, convId: string) {
  if (!receiver.phone) return;
  const link = `${window.location.origin}/inbox?conv=${convId}&with=${sender.id}`;
  await sendSMS(receiver.phone, `New Filmons message from ${sender.username || sender.name}: "${preview}"\n${link}`);
}

// ── Immediate email (no delay — for real-time Inbox notifications) ───────────
//
// Anti-spam: 1 email per receiver per conversation per 30 minutes.
// Called from the Inbox Realtime handler when a message arrives for the user.

const IMMEDIATE_SPAM_TTL = 30 * 60 * 1000;

export function notifyImmediateEmail({
  receiverId,
  receiverEmail,
  receiverName,
  senderName,
  senderId,
  messageText,
  conversationId,
  isRequest,
  kind,
  listing,
}: {
  receiverId: string;
  receiverEmail: string;
  receiverName: string;
  senderName: string;
  senderId: string;
  messageText: string;
  conversationId: string;
  isRequest: boolean;
  kind?: MessageKind;
  listing?: ListingContext;
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

  const resolvedKind: MessageKind = kind ?? (isRequest ? 'request' : 'direct');
  const preview  = (messageText || (isRequest ? 'Message request' : 'New message')).slice(0, 120);
  const subject  = buildSubject(senderName, resolvedKind, listing);
  const convLink = `${window.location.origin}/inbox?conv=${conversationId}&with=${senderId}`;
  const settingsUrl = `${window.location.origin}/settings/notifications`;

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
          unsubscribe_url:   settingsUrl,
          settings_url:      settingsUrl,
          listing_title:     listing?.title    || '',
          listing_price:     listing?.price    != null ? `$${listing.price}` : '',
          listing_location:  listing?.location || '',
          listing_id:        listing?.id       || '',
        },
        EMAILJS_CONFIG.publicKey,
      );
    } catch (e) {
      console.warn('[msgNotif] immediate email failed:', e);
    }
  }).catch(() => {});
}

// ── Main entry (synchronous — schedules its own timers) ───────────────────────

export function notifyReceiverForMessage({
  receiverId,
  sender,
  messageText,
  conversationId,
  kind = 'direct',
  listing,
}: {
  receiverId: string;
  sender: Sender;
  messageText: string;
  conversationId: string;
  kind?: MessageKind;
  listing?: ListingContext;
}): void {
  if (receiverId === sender.id) return;

  const preview = (messageText || 'New message').slice(0, 120);

  // ── Email after 5 min ────────────────────────────────────────────────────────
  setTimeout(async () => {
    try {
      if (await receiverIsOnline(receiverId))                   return;
      if (await conversationIsRead(conversationId, receiverId)) return;
      if (!canSend(receiverId, conversationId, 'email'))        return;

      const [receiver, settings] = await Promise.all([loadProfile(receiverId), loadSettings(receiverId)]);
      if (!receiver) return;

      if (emailEnabledForKind(settings, kind)) {
        await dispatchEmail(receiver, sender, preview, conversationId, kind, listing);
        markSent(receiverId, conversationId, 'email');
      }
    } catch (e) { console.error('[msgNotif] email timer error:', e); }
  }, EMAIL_DELAY);

  // ── SMS after 10 min ─────────────────────────────────────────────────────────
  setTimeout(async () => {
    try {
      if (await receiverIsOnline(receiverId))                   return;
      if (await conversationIsRead(conversationId, receiverId)) return;
      if (!canSend(receiverId, conversationId, 'sms'))          return;

      const [receiver, settings] = await Promise.all([loadProfile(receiverId), loadSettings(receiverId)]);
      if (!receiver?.phone) return;

      if (settings.notif_dms !== false && settings.sms_messages === true) {
        await dispatchSMS(receiver, sender, preview, conversationId);
        markSent(receiverId, conversationId, 'sms');
      }
    } catch (e) { console.error('[msgNotif] sms timer error:', e); }
  }, SMS_DELAY);
}
