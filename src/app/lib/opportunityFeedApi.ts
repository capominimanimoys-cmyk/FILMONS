// Server-authoritative Opportunity allowance for Home and Browse/Search --
// Guest/Creator/Creator+ are capped at 5 Opportunity listings per
// calendar day, enforced by get-opportunity-feed (see that function's own
// header comment) rather than trusted client-side. Professional/Business
// call this too but always get { unlimited: true } back, since the tier
// check happens server-side against the real profiles row.
//
// Deliberately returns only listing ids, not full Listing rows -- Home.tsx
// and SearchOverlay.tsx each already have their own row shape/mapping
// (Listing vs. SearchOverlay's simpler ListingRow) and their own existing
// query for it; this just tells each caller *which* (at most 5) ids
// they're allowed to show today.
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { getGuestId } from './guestIdentity';

export interface OpportunityAllowance {
  unlimited: boolean;
  listingIds: string[];
  limitReached: boolean;
}

export const opportunityFeedApi = {
  async getAllowance(userId: string | null | undefined, isGuest: boolean): Promise<OpportunityAllowance> {
    const guest = isGuest || !userId;
    const userKey = guest ? getGuestId() : userId;
    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/get-opportunity-feed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` },
        body: JSON.stringify({ userKey, isGuest: guest }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        console.warn('[opportunityFeedApi] get-opportunity-feed failed:', data.error);
        return { unlimited: false, listingIds: [], limitReached: false };
      }
      if (data.unlimited) return { unlimited: true, listingIds: [], limitReached: false };
      return { unlimited: false, listingIds: data.listingIds || [], limitReached: !!data.limitReached };
    } catch (e) {
      console.warn('[opportunityFeedApi] get-opportunity-feed threw:', e);
      // Network failure: fail closed to an empty limited allowance, never
      // to "unlimited" -- the whole point is this can't be bypassed by a
      // flaky connection either.
      return { unlimited: false, listingIds: [], limitReached: false };
    }
  },
};
