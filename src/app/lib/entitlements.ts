// Canonical Opportunity entitlements — display/UI only, mirrors (never
// enforces) supabase/functions/_shared/entitlements.ts, the real
// enforcement copy the edge functions read. Keep both in sync if these
// numbers ever change; never scatter the raw limit numbers elsewhere.
import { supabase } from '../../lib/supabase';
import { AccountTier, normalizeTier } from './reliabilityApi';
import { projectId, publicAnonKey } from '/utils/supabase/info';

export interface TierEntitlement {
  posts: number | null;        // Opportunity publishes per `window`; null = unlimited
  applications: number | null; // Opportunity applications per `window`; null = unlimited
  priceCents: number;          // CAD, per month (billing cadence -- unrelated to `window`); 0 = free
  swipesPerDay: number | null; // Home deck Like+Pass swipes per calendar day; null = unlimited
  // Reset cadence for posts/applications specifically -- must match
  // supabase/functions/_shared/entitlements.ts's `window` field exactly,
  // or this file's usage/reset display would disagree with what the
  // server actually enforces.
  window: 'week' | 'month';
}

export const ENTITLEMENTS: Record<AccountTier, TierEntitlement> = {
  // applications: 0 -- Creator+ is now mandatory to apply for Opportunities
  // at all (Creator can still post the 2/week free Opportunity listings).
  creator:      { posts: 2,    applications: 0,    priceCents: 0,    swipesPerDay: 10,   window: 'week'  },
  creator_plus: { posts: 2,    applications: 2,    priceCents: 0,    swipesPerDay: 25,   window: 'month' },
  professional: { posts: 5,    applications: 5,    priceCents: 999,  swipesPerDay: null, window: 'week'  },
  business:     { posts: null, applications: null, priceCents: 1999, swipesPerDay: null, window: 'month' },
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

// Same boundary logic as supabase/functions/_shared/limitWindow.ts's
// windowStart() -- kept as a separate copy since one runs in Deno and one
// in the browser, but must compute the identical Monday-00:00-UTC (or
// month-start) instant or the usage/reset display shown here would
// disagree with what the server actually enforced.
export function windowStart(unit: 'week' | 'month', now: Date = new Date()): Date {
  if (unit === 'month') {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  }
  const day = now.getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - daysSinceMonday);
  return new Date(Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate(), 0, 0, 0, 0));
}

// "Resets Monday" for a weekly window; "Resets [Month] 1" for monthly.
// Display-only, purely derived from `unit` -- never a separate stored date.
export function resetLabel(unit: 'week' | 'month', now: Date = new Date()): string {
  if (unit === 'month') {
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    return `Resets ${next.toLocaleDateString('en-CA', { month: 'long', day: 'numeric' })}`;
  }
  const nextMonday = new Date(windowStart('week', now));
  nextMonday.setUTCDate(nextMonday.getUTCDate() + 7);
  const daysLeft = Math.ceil((nextMonday.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  if (daysLeft <= 1) return 'Weekly limit resets tomorrow';
  return `Weekly limit resets in ${daysLeft} days`;
}

// Real COUNT reads (within the current window, regardless of later status)
// — display only, never used to enforce anything. Reads are always fine
// client-side per this app's open-RLS convention; only the write path is
// server-enforced. Window is tier-aware (weekly for Creator/Professional,
// monthly for Creator+/Business) so this never shows a monthly count
// against a weekly limit or vice versa.
export async function getOpportunityUsage(userId: string, accountType?: string): Promise<{ posts: number; applications: number }> {
  const iso = windowStart(getEntitlement(accountType).window).toISOString();

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
