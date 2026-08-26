/**
 * followNotification.ts — fires the "new follower" email immediately.
 *
 * Mirrors messageNotification.ts: fire-and-forget call to a dedicated
 * edge function that owns the recipient lookup, the notif_new_followers
 * gate, and the actual EmailJS send (private key, server-side only).
 */
import { projectId, publicAnonKey } from '/utils/supabase/info';

export function notifyReceiverForFollow({
  followedId,
  followerId,
  followerName,
  followerUsername,
}: {
  followedId: string;
  followerId: string;
  followerName: string;
  followerUsername?: string;
}): void {
  if (followedId === followerId) return;

  fetch(`https://${projectId}.supabase.co/functions/v1/send-follow-notification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` },
    body: JSON.stringify({ followedId, followerId, followerName, followerUsername }),
  }).catch(e => console.warn('[followNotif] send failed:', e));
}
