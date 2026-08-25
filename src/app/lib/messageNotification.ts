/**
 * messageNotification.ts — schedules the "new message" email.
 *
 * This used to run the whole thing client-side: a setTimeout(5min) that
 * checked online/read state and called EmailJS directly from the sender's
 * browser tab. That only fired if the sender kept the tab open and idle
 * for the full 5 minutes -- closing it, navigating away, or the mobile
 * browser backgrounding it silently lost the timer, so the recipient's
 * email never went out.
 *
 * Now this just writes one row to pending_message_notifications the
 * moment a message is sent (persists immediately, survives whatever the
 * sender does next) and a cron-driven edge function
 * (send-message-notifications, every 5 min) picks up due rows and sends
 * the email server-side. See that function for the actual send/gating
 * logic (online check, notif_dms setting, 1/hour rate limit).
 */
import { supabase } from '../../lib/supabase';

interface Sender { id: string; name: string; username?: string; }

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

const EMAIL_DELAY_MS = 5 * 60 * 1000;

export function notifyReceiverForMessage({
  receiverId,
  sender,
  messageText,
  conversationId,
  kind = 'direct',
  listing,
  messageId,
}: {
  receiverId: string;
  sender: Sender;
  messageText: string;
  conversationId: string;
  kind?: MessageKind;
  listing?: ListingContext;
  messageId?: string;
}): void {
  if (receiverId === sender.id) return;

  const preview = (messageText || 'New message').slice(0, 120);

  supabase.from('pending_message_notifications').insert({
    message_id:      messageId || `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    conversation_id: conversationId,
    receiver_id:     receiverId,
    sender_id:       sender.id,
    sender_name:     sender.username || sender.name,
    message_preview: preview,
    kind,
    listing_title:   listing?.title || null,
    listing_id:      listing?.id    || null,
    send_after:      new Date(Date.now() + EMAIL_DELAY_MS).toISOString(),
  }).then(({ error }) => {
    if (error) console.warn('[msgNotif] schedule insert failed:', error.message);
  });
}
