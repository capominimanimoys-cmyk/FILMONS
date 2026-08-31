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
  // Reset cadence for posts/applications specifically. Creator and
  // Professional reset weekly (Monday 00:00 through Sunday 23:59, server/
  // UTC time -- this app has no per-user timezone to key off yet);
  // Creator+ and Business stay on a calendar-month window.
  window: 'week' | 'month';
}

export const ENTITLEMENTS: Record<AccountTier, TierEntitlement> = {
  // posts: 0, applications: 0 -- Creator+ is now mandatory for Opportunities
  // entirely, both posting and applying (limit 0 blocks on the very first
  // attempt, same as ENTITLEMENTS.creator.applications already did).
  creator:      { posts: 0,    applications: 0,    priceCents: 0,    swipesPerDay: 25,   window: 'week'  },
  creator_plus: { posts: 2,    applications: 2,    priceCents: 0,    swipesPerDay: 25,   window: 'month' },
  professional: { posts: 5,    applications: 5,    priceCents: 999,  swipesPerDay: null, window: 'week'  },
  business:     { posts: null, applications: null, priceCents: 1999, swipesPerDay: null, window: 'month' },
};

// Same legacy-string normalization as src/app/lib/reliabilityApi.ts's
// normalizeTier() -- never trust a raw account_type string without this.
export function normalizeTier(t?: string | null): AccountTier {
  if (t === 'business') return 'business';
  if (t === 'professional') return 'professional';
  if (t === 'creator_plus' || t === 'service') return 'creator_plus';
  return 'creator';
}
