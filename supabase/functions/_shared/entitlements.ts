// Canonical Opportunity entitlements — the ONE source of truth for every
// edge function that enforces a limit or prices a subscription. Mirrored
// (display-only, never for enforcement) by src/app/lib/entitlements.ts —
// keep both in sync if these numbers ever change.
export type AccountTier = 'creator' | 'creator_plus' | 'professional' | 'business';

export interface TierEntitlement {
  posts: number | null;        // Opportunity publishes per `window`; null = unlimited
  applications: number | null; // Opportunity applications per `window`; null = unlimited
  priceCents: number;          // CAD, per month (billing cadence -- unrelated to `window`); 0 = free
  swipesPerDay: number | null; // Home deck Like+Pass swipes per calendar day; null = unlimited
  // Orphaned as of the "Opportunity Listings must never disappear from
  // Home/Browse/Search" rule -- Home.tsx no longer truncates the swipe
  // queue by a daily viewing budget at all (every tier, Guest included,
  // sees every real Opportunity listing). get-opportunity-feed /
  // record-opportunity-swipe still read this field but are no longer
  // called from the client anywhere; left in place rather than torn out
  // (deleting edge functions + their SQL backing + CI deploy entries) since
  // nothing calls them and they're otherwise harmless. Only `applications`
  // below matters now -- viewing is unrestricted, applying is what's
  // limited (weekly).
  opportunityQueueDaily: number | null;
  // Reset cadence for posts/applications specifically. Creator, Creator+
  // and Professional all reset weekly (Monday 00:00 through Sunday 23:59,
  // server/UTC time -- this app has no per-user timezone to key off yet);
  // Business stays on a calendar-month window (moot in practice since its
  // posts/applications are both unlimited, but kept for type completeness).
  window: 'week' | 'month';
}

export const ENTITLEMENTS: Record<AccountTier, TierEntitlement> = {
  // posts and applications are BOTH 0 for Creator, permanently -- not a
  // resettable weekly quota. Applying to a paid Opportunity can require
  // receiving a payout, and Wallet access only starts at Creator+ (see
  // Wallet.tsx's isCreatorPlus gate client-side, isCreatorPlus() below
  // server-side), so a plain Creator has no Wallet to pay into and is
  // blocked from applying entirely, not just rate-limited.
  creator:      { posts: 0,    applications: 0,    priceCents: 0,    swipesPerDay: 25,   opportunityQueueDaily: 2,    window: 'week'  },
  creator_plus: { posts: 1,    applications: 2,    priceCents: 0,    swipesPerDay: 25,   opportunityQueueDaily: 5,    window: 'week'  },
  professional: { posts: 5,    applications: 5,    priceCents: 999,  swipesPerDay: null, opportunityQueueDaily: null, window: 'week'  },
  business:     { posts: null, applications: null, priceCents: 1999, swipesPerDay: null, opportunityQueueDaily: null, window: 'month' },
};

// Guest (no account at all) isn't part of AccountTier -- same daily cap as
// Creator today, kept as its own named constant rather than folded into
// the map so it's clear this is a deliberate, separate policy decision,
// not an accident of some "guest === creator" fallback.
export const GUEST_OPPORTUNITY_QUEUE_DAILY = 2;

// Same legacy-string normalization as src/app/lib/reliabilityApi.ts's
// normalizeTier() -- never trust a raw account_type string without this.
export function normalizeTier(t?: string | null): AccountTier {
  if (t === 'business') return 'business';
  if (t === 'professional') return 'professional';
  if (t === 'creator_plus' || t === 'service') return 'creator_plus';
  return 'creator';
}

// Server-side twin of src/app/lib/reliabilityApi.ts's isCreatorPlus() --
// that file isn't importable from Deno edge functions (it pulls in the
// browser supabase client), so this is duplicated rather than shared.
export function isCreatorPlus(t?: string | null): boolean {
  const tier = normalizeTier(t);
  return tier === 'creator_plus' || tier === 'professional' || tier === 'business';
}
