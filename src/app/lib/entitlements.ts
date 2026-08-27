// Canonical Opportunity entitlements — display/UI only, mirrors (never
// enforces) supabase/functions/_shared/entitlements.ts, the real
// enforcement copy the edge functions read. Keep both in sync if these
// numbers ever change; never scatter the raw limit numbers elsewhere.
import { supabase } from '../../lib/supabase';
import { AccountTier, normalizeTier } from './reliabilityApi';
import { projectId, publicAnonKey } from '/utils/supabase/info';

export interface TierEntitlement {
  posts: number | null;        // Opportunity publishes per calendar month; null = unlimited
  applications: number | null; // Opportunity applications per calendar month; null = unlimited
  priceCents: number;          // CAD, per month; 0 = free
  swipesPerDay: number | null; // Home deck Like+Pass swipes per calendar day; null = unlimited
}

export const ENTITLEMENTS: Record<AccountTier, TierEntitlement> = {
  // applications: 0 -- Creator+ is now mandatory to apply for Opportunities
  // at all (Creator can still post the 2/month free Opportunity listings).
  creator:      { posts: 2,    applications: 0,    priceCents: 0,    swipesPerDay: 10   },
  creator_plus: { posts: 2,    applications: 2,    priceCents: 0,    swipesPerDay: 25   },
  professional: { posts: 5,    applications: 5,    priceCents: 999,  swipesPerDay: null },
  business:     { posts: null, applications: null, priceCents: 1999, swipesPerDay: null },
};

export function getEntitlement(accountType?: string): TierEntitlement {
  return ENTITLEMENTS[normalizeTier(accountType)];
}

export function formatLimit(n: number | null): string {
  return n === null ? 'Unlimited' : String(n);
}

export function formatPrice(cents: number): string {
  return cents === 0 ? 'Free' : `$${(cents / 100).toFixed(2)}`;
}

// Real COUNT reads (this month, regardless of later status) — display only,
// never used to enforce anything. Reads are always fine client-side per
// this app's open-RLS convention; only the write path is server-enforced.
export async function getOpportunityUsage(userId: string): Promise<{ posts: number; applications: number }> {
  const monthStart = new Date();
  monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const iso = monthStart.toISOString();

  const [{ count: posts }, { count: applications }] = await Promise.all([
    supabase.from('listings').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).eq('listing_type', 'opportunity').gte('created_at', iso),
    supabase.from('opportunity_applications').select('id', { count: 'exact', head: true })
      .eq('applicant_id', userId).gte('created_at', iso),
  ]);
  return { posts: posts || 0, applications: applications || 0 };
}

async function callFn(name: string, body: Record<string, unknown>) {
  const res = await fetch(`https://${projectId}.supabase.co/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export interface LimitReachedInfo { plan: AccountTier; limit: number | null }

export const entitlementsApi = {
  // Both throw a plain Error on real failures; on a limit, they return
  // { limitReached: LimitReachedInfo } instead of throwing, so callers can
  // swap to the upgrade view without a try/catch just for the expected case.
  submitOpportunityApplication: async (params: {
    userId: string; listingId: string; ownerId: string; message?: string;
    portfolioUrl?: string; resumeUrl?: string; demoReelUrl?: string;
    availability?: string; expectedRate?: string; customAnswers?: Record<string, string>;
  }): Promise<{ applicationId: string } | { limitReached: LimitReachedInfo }> => {
    const { ok, status, data } = await callFn('submit-opportunity-application', params);
    if (!ok) {
      if (status === 403 && data.error === 'limit_reached') return { limitReached: { plan: data.plan, limit: data.limit } };
      throw new Error(data.error || 'Could not submit application');
    }
    return { applicationId: data.application.id };
  },

  publishOpportunity: async (userId: string, row: Record<string, unknown>): Promise<{ listing: any } | { limitReached: LimitReachedInfo }> => {
    const { ok, status, data } = await callFn('publish-opportunity', { userId, row });
    if (!ok) {
      if (status === 403 && data.error === 'limit_reached') return { limitReached: { plan: data.plan, limit: data.limit } };
      throw new Error(data.error || 'Could not publish opportunity');
    }
    return { listing: data.listing };
  },

  startSubscriptionCheckout: async (userId: string, plan: 'professional' | 'business', successUrl: string, cancelUrl: string): Promise<{ url: string }> => {
    const { ok, data } = await callFn('subscription-charge', { userId, plan, successUrl, cancelUrl });
    if (!ok) throw new Error(data.error || 'Could not start checkout');
    return { url: data.url };
  },

  verifySubscription: async (sessionId: string): Promise<{ activated: boolean; profile: any }> => {
    const res = await fetch(`https://${projectId}.supabase.co/functions/v1/subscription-charge/verify?session_id=${sessionId}`, {
      headers: { Authorization: `Bearer ${publicAnonKey}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not verify subscription');
    return { activated: !!data.activated, profile: data.profile };
  },

  cancelSubscription: async (userId: string): Promise<void> => {
    const { ok, data } = await callFn('cancel-subscription', { userId });
    if (!ok) throw new Error(data.error || 'Could not cancel subscription');
  },
};
