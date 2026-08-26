/**
 * messageNotification.ts — fires the "new message" email immediately.
 *
 * Used to be a two-stage system: write a row, then a 5-minute cron would
 * send it later, only if the recipient was still offline/unread by then.
 * Per explicit request, this now matches how every application-status
 * email already worked — fire immediately when the action happens, no
 * delay, no online/read gate. Still rate-limited server-side to one of
 * these per receiver+conversation per hour, and still respects the
 * recipient's notif_dms setting — see send-message-notification.
 */
import { projectId, publicAnonKey } from '/utils/supabase/info';

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

export function notifyReceiverForMessage({
  receiverId,
  sender,
  messageText,
  conversationId,
  kind = 'direct',
  listing,
  messageId,
  requestType,
  rentalDates,
  requestMessage,
}: {
  receiverId: string;
  sender: Sender;
  messageText: string;
  conversationId: string;
  kind?: MessageKind;
  listing?: ListingContext;
  messageId?: string;
  /** Set for rental_request messages -- picks the dedicated rental/purchase
   *  request email template instead of the generic new-message one. */
  requestType?: 'rental_request' | 'purchase_request';
  rentalDates?: string;
  requestMessage?: string | null;
}): void {
  if (receiverId === sender.id) return;

  fetch(`https://${projectId}.supabase.co/functions/v1/send-message-notification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` },
    body: JSON.stringify({
      receiverId,
      senderId:   sender.id,
      senderName: sender.username || sender.name,
      messageText,
      conversationId,
      kind,
      listingTitle: listing?.title,
      listingId:    listing?.id,
      messageId,
      requestType,
      rentalDates,
      requestMessage,
    }),
  }).catch(e => console.warn('[msgNotif] send failed:', e));
}
