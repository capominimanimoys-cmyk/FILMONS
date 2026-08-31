// Server-authoritative Opportunity swipe limit for Home's deck --
// Guest/Creator/Creator+ can see ALL Opportunity listings, but only 5
// swipes/day (separate from the general Home swipe limit); Professional/
// Business are unlimited. Tier is resolved server-side in both endpoints
// (get-opportunity-feed / record-opportunity-swipe), never trusted from
// the client.
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { getGuestId } from './guestIdentity';

export interface OpportunitySwipeStatus {
  unlimited: boolean;
  swipeCount: number;
  limit: number;
}

export interface RecordSwipeResult {
  allowed: boolean;
  swipeCount: number;
}

function resolveUserKey(userId: string | null | undefined, isGuest: boolean): { userKey: string; guest: boolean } {
  const guest = isGuest || !userId;
  return { userKey: guest ? getGuestId() : userId!, guest };
}

export const opportunityFeedApi = {
  async getSwipeStatus(userId: string | null | undefined, isGuest: boolean): Promise<OpportunitySwipeStatus> {
    const { userKey, guest } = resolveUserKey(userId, isGuest);
    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/get-opportunity-feed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` },
        body: JSON.stringify({ userKey, isGuest: guest }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        console.warn('[opportunityFeedApi] get-opportunity-feed failed:', data.error);
        return { unlimited: false, swipeCount: 5, limit: 5 }; // fail closed, never open
      }
      return { unlimited: !!data.unlimited, swipeCount: data.swipeCount ?? 0, limit: data.limit ?? 5 };
    } catch (e) {
      console.warn('[opportunityFeedApi] get-opportunity-feed threw:', e);
      return { unlimited: false, swipeCount: 5, limit: 5 };
    }
  },

  async recordSwipe(userId: string | null | undefined, isGuest: boolean, listingId: string): Promise<RecordSwipeResult> {
    const { userKey } = resolveUserKey(userId, isGuest);
    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/record-opportunity-swipe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` },
        body: JSON.stringify({ userKey, listingId }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        console.warn('[opportunityFeedApi] record-opportunity-swipe failed:', data.error);
        return { allowed: false, swipeCount: 5 };
      }
      return { allowed: !!data.allowed, swipeCount: data.swipeCount ?? 0 };
    } catch (e) {
      console.warn('[opportunityFeedApi] record-opportunity-swipe threw:', e);
      return { allowed: false, swipeCount: 5 };
    }
  },
};
