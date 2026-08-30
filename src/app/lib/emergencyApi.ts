// Emergency Listing — fixed-tier paid feed-recycling boost (72-hour $4.99
// or 7-day $9.99 CAD), distinct from the variable-budget listing_boosts
// system (see boostApi.ts). Mirrors that file's Stripe Checkout pattern
// (create Checkout Session via an edge function, verify on return, webhook
// is the only thing that actually activates anything) and reuses
// boost_events for the "how recently has this viewer seen this listing"
// query the feed-recycling spacing rule needs (source='emergency').
import { supabase } from '../../lib/supabase';
import { projectId, publicAnonKey } from '/utils/supabase/info';

export type EmergencyPlan = '72_hour' | '7_day';
export type EmergencyStatus = 'pending_payment' | 'active' | 'expired' | 'failed' | 'refunded';

export interface ListingEmergency {
  id: string;
  listingId: string;
  ownerId: string;
  plan: EmergencyPlan;
  amount: number;
  currency: string;
  status: EmergencyStatus;
  activatedAt?: string;
  expiresAt?: string;
  createdAt: string;
}

// Display only, mirrors emergency-charge's PLAN_PRICING exactly -- the
// server is the one place this is actually enforced; never trust a price
// computed client-side for the real charge.
export const EMERGENCY_PLANS: { plan: EmergencyPlan; label: string; amountCad: number; durationLabel: string }[] = [
  { plan: '72_hour', label: '72-Hour Emergency', amountCad: 4.99, durationLabel: '72 hours' },
  { plan: '7_day',   label: '7-Day Emergency',   amountCad: 9.99, durationLabel: '7 days' },
];

function mapEmergency(row: any): ListingEmergency {
  return {
    id: row.id, listingId: row.listing_id, ownerId: row.owner_id,
    plan: row.plan, amount: row.amount, currency: row.currency, status: row.status,
    activatedAt: row.activated_at || undefined, expiresAt: row.expires_at || undefined,
    createdAt: row.created_at,
  };
}

const FN_URL = (name: string) => `https://${projectId}.supabase.co/functions/v1/${name}`;
const FN_HEADERS = { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` };

const _loggedEmergencyImpressions = new Set<string>();

export const emergencyApi = {
  charge: async (params: {
    listingId: string; ownerId: string; plan: EmergencyPlan; successUrl: string; cancelUrl: string;
  }): Promise<{ url: string; sessionId: string; emergencyId: string; amount: number }> => {
    const res = await fetch(FN_URL('emergency-charge'), {
      method: 'POST', headers: FN_HEADERS,
      body: JSON.stringify({
        listingId: params.listingId, ownerId: params.ownerId, plan: params.plan,
        success_url: params.successUrl, cancel_url: params.cancelUrl,
      }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'Could not start Emergency Listing checkout');
    return { url: data.url, sessionId: data.session_id, emergencyId: data.emergency_id, amount: data.amount };
  },

  verify: async (sessionId: string): Promise<{ emergency: ListingEmergency | null }> => {
    const res = await fetch(`${FN_URL('emergency-charge')}/verify?session_id=${sessionId}`, { headers: FN_HEADERS });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'Could not verify Emergency Listing payment');
    return { emergency: data.emergency ? mapEmergency(data.emergency) : null };
  },

  getActiveEmergency: async (listingId: string): Promise<ListingEmergency | null> => {
    const { data } = await supabase
      .from('listing_emergencies')
      .select('*')
      .eq('listing_id', listingId)
      .in('status', ['active', 'pending_payment'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data ? mapEmergency(data) : null;
  },

  // "Has this viewer already been shown this recycled (already-swiped)
  // Emergency listing recently?" -- same shape as
  // boostApi.getRecentlySeenBoosted, just source='emergency' and a
  // tighter default cooldown (this is about not repeating the *same* card
  // too soon, not about overall promotional overexposure).
  getRecentlySeenEmergency: async (viewerId: string, listingIds: string[], cooldownHours: number): Promise<Record<string, number>> => {
    const result: Record<string, number> = {};
    if (!viewerId || !listingIds.length) return result;
    const since = new Date(Date.now() - cooldownHours * 60 * 60 * 1000).toISOString();
    const { data } = await supabase.from('boost_events')
      .select('listing_id')
      .eq('viewer_id', viewerId)
      .eq('event_type', 'impression')
      .eq('source', 'emergency')
      .in('listing_id', listingIds)
      .gte('created_at', since);
    (data || []).forEach((r: any) => { result[r.listing_id] = (result[r.listing_id] || 0) + 1; });
    return result;
  },

  // Fire-and-forget, deduped per running session -- logs that a recycled
  // Emergency listing was actually served to this viewer, so the next
  // fetch's spacing check (above) knows to hold it back for a while.
  logImpression: (listingId: string, viewerId?: string) => {
    const key = `${listingId}:${viewerId || 'anon'}`;
    if (_loggedEmergencyImpressions.has(key)) return;
    _loggedEmergencyImpressions.add(key);
    supabase.from('boost_events').insert({
      listing_id: listingId, event_type: 'impression', source: 'emergency', viewer_id: viewerId || null,
    }).then(undefined, () => {});
  },

  // Server-verified gate for BROWSING the Emergency category (Home.tsx's
  // "Emergency" filter tab) -- distinct from purchasing/creating one, which
  // stays open to any listing owner. Never trust the client's own
  // account_type for this decision; check-emergency-access re-derives tier
  // from profiles server-side.
  checkBrowseAccess: async (userId: string): Promise<{ allowed: boolean; message?: string }> => {
    try {
      const res = await fetch(FN_URL('check-emergency-access'), {
        method: 'POST', headers: FN_HEADERS, body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      return { allowed: !!data.allowed, message: data.message };
    } catch {
      return { allowed: false, message: 'Could not verify access — please try again.' };
    }
  },
};
