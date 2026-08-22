// Canonical Opportunity entitlements — the ONE source of truth for every
// edge function that enforces a limit or prices a subscription. Mirrored
// (display-only, never for enforcement) by src/app/lib/entitlements.ts —
// keep both in sync if these numbers ever change.
export type AccountTier = 'creator' | 'creator_plus' | 'professional' | 'business';

export interface TierEntitlement {
  posts: number | null;        // Opportunity publishes per calendar month; null = unlimited
  applications: number | null; // Opportunity applications per calendar month; null = unlimited
  priceCents: number;          // CAD, per month; 0 = free
}

export const ENTITLEMENTS: Record<AccountTier, TierEntitlement> = {
  creator:      { posts: 2,    applications: 2,    priceCents: 0 },
  creator_plus: { posts: 2,    applications: 2,    priceCents: 0 },
  professional: { posts: 5,    applications: 5,    priceCents: 999 },
  business:     { posts: null, applications: null, priceCents: 1999 },
};

// Same legacy-string normalization as src/app/lib/reliabilityApi.ts's
// normalizeTier() -- never trust a raw account_type string without this.
export function normalizeTier(t?: string | null): AccountTier {
  if (t === 'business') return 'business';
  if (t === 'professional') return 'professional';
  if (t === 'creator_plus' || t === 'service') return 'creator_plus';
  return 'creator';
}
