// Universal FILMONS Share system -- one service backing <SharePostSheet/>
// for every eligible Connect content type (posts, Portfolio items,
// Portfolio albums), per the "Share vs Repost" spec. Mirrors the existing
// ShareListingModal.tsx pattern (chatApi.getOrCreateDB + sendMessageToDB)
// rather than inventing a new send path, just generalized to N recipients
// and N content types instead of one listing to one friend.
//
// Sharing never duplicates the original content -- a message only ever
// carries a lightweight SharedContentSnapshot (creator/caption/thumbnail
// for instant display) plus (contentType, contentId). SharedContentBubble
// re-resolves the real content by that id before letting a recipient open
// it, so edits/deletion/visibility changes on the original are always
// respected (see SharedContentBubble.tsx).
import { chatApi } from './api';
import type { SharedContentSnapshot } from '../types';

export function getSharedContentDeepLink(snapshot: Pick<SharedContentSnapshot, 'contentType' | 'contentId' | 'creatorId'>): string {
  const origin = window.location.origin;
  switch (snapshot.contentType) {
    case 'post':
      return `${origin}/post/${snapshot.contentId}`;
    case 'portfolio_item':
    case 'portfolio_album':
      // No dedicated per-item/per-album route exists yet (both open as
      // overlays over the creator's Portfolio) -- deep-links land on the
      // creator's Portfolio, same destination the existing per-card Share
      // buttons already used before this system.
      return `${origin}/portfolio/${snapshot.creatorId}`;
    case 'connection':
      return `${origin}/host/${snapshot.creatorId}`;
    default:
      return origin;
  }
}

/** Sends `snapshot` to each recipient as its own direct message (never a
 *  new Connect post, never a duplicated copy of the original content --
 *  spec §10). Continues past a single failed recipient rather than
 *  aborting the whole batch; the caller decides how to report partial
 *  failure. */
export async function shareContentToRecipients(params: {
  snapshot: SharedContentSnapshot;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  recipientIds: string[];
  message?: string;
}): Promise<{ sentCount: number; failedCount: number }> {
  const { snapshot, senderId, senderName, senderAvatar, recipientIds, message } = params;
  let sentCount = 0, failedCount = 0;

  await Promise.all(recipientIds.map(async recipientId => {
    try {
      const conv = await chatApi.getOrCreateDB(senderId, recipientId);
      const msg = chatApi.shareContent(conv.id, senderId, senderName, senderAvatar, snapshot, message);
      await chatApi.sendMessageToDB(conv.id, msg, conv.participantIds, conv.isRequest ?? false, conv.requestedBy ?? null);
      sentCount++;
    } catch (e) {
      console.error('[shareApi] send failed for recipient', recipientId, e);
      failedCount++;
    }
  }));

  return { sentCount, failedCount };
}
