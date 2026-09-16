// Reads the FILMONS Reliability Score / Trust Badge data computed server-side
// by fn_recalculate_filmons_reliability() (see
// supabase/migrations/20240501000000_filmons_reliability_system.sql). The
// frontend never computes or submits a score -- it only ever displays the
// filmons_* columns already written to `reputation_scores`.
import { supabase } from '../../lib/supabase';

export type TrustLevel = 'new' | 'building_trust' | 'reliable' | 'trusted' | 'elite';

export const TRUST_LEVELS: { level: TrustLevel; label: string; minScore: number }[] = [
  { level: 'new',             label: 'New',            minScore: 0 },
  { level: 'building_trust',  label: 'Building Trust', minScore: 20 },
  { level: 'reliable',        label: 'Reliable',       minScore: 40 },
  { level: 'trusted',         label: 'Trusted',        minScore: 60 },
  { level: 'elite',           label: 'Elite',          minScore: 80 },
];

export function trustLevelLabel(level: TrustLevel | string | null | undefined): string {
  return TRUST_LEVELS.find(t => t.level === level)?.label ?? 'New';
}

// Next level + points remaining, or null once already Elite.
export function nextTrustLevel(score: number, level: TrustLevel): { label: string; pointsRemaining: number } | null {
  const idx = TRUST_LEVELS.findIndex(t => t.level === level);
  if (idx === -1 || idx === TRUST_LEVELS.length - 1) return null;
  const next = TRUST_LEVELS[idx + 1];
  return { label: next.label, pointsRemaining: Math.max(0, Math.ceil(next.minScore - score)) };
}

export interface TrustProfile {
  userId: string;
  reliabilityScore: number;
  trustLevel: TrustLevel;
  connectionScore: number;
  recommendationScore: number;
  transactionScore: number;
  identityScore: number;
  validConnections: number;
  connectionsByStrength: { elite: number; trusted: number; reliable: number; buildingNew: number };
  connectionsByType: { creator: number; creatorPlus: number; professional: number; business: number };
  validRecommendations: number;
  completedRentals: number;
  completedBuySell: number;
  completedPaidServices: number;
  completedPaidOpportunities: number;
  identityVerified: boolean;
  updatedAt: string | null;
}

const EMPTY: Omit<TrustProfile, 'userId'> = {
  reliabilityScore: 0, trustLevel: 'new',
  connectionScore: 0, recommendationScore: 0, transactionScore: 0, identityScore: 0,
  validConnections: 0,
  connectionsByStrength: { elite: 0, trusted: 0, reliable: 0, buildingNew: 0 },
  connectionsByType: { creator: 0, creatorPlus: 0, professional: 0, business: 0 },
  validRecommendations: 0,
  completedRentals: 0, completedBuySell: 0, completedPaidServices: 0, completedPaidOpportunities: 0,
  identityVerified: false, updatedAt: null,
};

export async function getTrustProfile(userId: string): Promise<TrustProfile> {
  const { data } = await supabase.from('reputation_scores').select(
    'filmons_reliability_score, filmons_trust_level, filmons_connection_score, filmons_recommendation_score, ' +
    'filmons_transaction_score, filmons_identity_score, filmons_valid_connections, filmons_connections_elite, ' +
    'filmons_connections_trusted, filmons_connections_reliable, filmons_connections_building_new, ' +
    'filmons_connections_creator, filmons_connections_creator_plus, filmons_connections_professional, filmons_connections_business, ' +
    'filmons_valid_recommendations, filmons_completed_rentals, filmons_completed_buy_sell, ' +
    'filmons_completed_paid_services, filmons_completed_paid_opportunities, filmons_identity_verified, filmons_score_updated_at',
  ).eq('user_id', userId).maybeSingle();

  if (!data) return { userId, ...EMPTY };

  return {
    userId,
    reliabilityScore: data.filmons_reliability_score ?? 0,
    trustLevel: (data.filmons_trust_level as TrustLevel) ?? 'new',
    connectionScore: data.filmons_connection_score ?? 0,
    recommendationScore: data.filmons_recommendation_score ?? 0,
    transactionScore: data.filmons_transaction_score ?? 0,
    identityScore: data.filmons_identity_score ?? 0,
    validConnections: data.filmons_valid_connections ?? 0,
    connectionsByStrength: {
      elite: data.filmons_connections_elite ?? 0,
      trusted: data.filmons_connections_trusted ?? 0,
      reliable: data.filmons_connections_reliable ?? 0,
      buildingNew: data.filmons_connections_building_new ?? 0,
    },
    connectionsByType: {
      creator: data.filmons_connections_creator ?? 0,
      creatorPlus: data.filmons_connections_creator_plus ?? 0,
      professional: data.filmons_connections_professional ?? 0,
      business: data.filmons_connections_business ?? 0,
    },
    validRecommendations: data.filmons_valid_recommendations ?? 0,
    completedRentals: data.filmons_completed_rentals ?? 0,
    completedBuySell: data.filmons_completed_buy_sell ?? 0,
    completedPaidServices: data.filmons_completed_paid_services ?? 0,
    completedPaidOpportunities: data.filmons_completed_paid_opportunities ?? 0,
    identityVerified: data.filmons_identity_verified ?? false,
    updatedAt: data.filmons_score_updated_at ?? null,
  };
}

// Lightweight batch fetch for feed cards (Home Portfolio/Listing cards) --
// only the trust level, never the full breakdown, to keep those queries cheap.
export async function getTrustLevelsBatch(userIds: string[]): Promise<Map<string, TrustLevel>> {
  const uniqueIds = [...new Set(userIds)];
  if (!uniqueIds.length) return new Map();
  const { data } = await supabase.from('reputation_scores')
    .select('user_id, filmons_trust_level').in('user_id', uniqueIds);
  const map = new Map<string, TrustLevel>();
  for (const row of data ?? []) map.set(row.user_id, (row.filmons_trust_level as TrustLevel) ?? 'new');
  return map;
}

// Module-level cache + in-flight dedup for single-card consumers that don't
// have a parent-level batching point of their own (e.g. ListingCard, which
// renders inside many independent list/grid pages -- Search, Category
// results, Home's swipe deck, Profile's listings tab, saved listings...).
// Threading a batched fetch through every one of those parents would be a
// much larger, riskier change than letting the card resolve its own trust
// level, deduped across however many cards for the SAME owner are mounted
// at once on a given page.
const trustLevelCache = new Map<string, TrustLevel>();
const trustLevelInFlight = new Map<string, Promise<TrustLevel>>();

export async function getTrustLevelCached(userId: string): Promise<TrustLevel> {
  const cached = trustLevelCache.get(userId);
  if (cached) return cached;
  const inFlight = trustLevelInFlight.get(userId);
  if (inFlight) return inFlight;

  const promise = supabase.from('reputation_scores').select('filmons_trust_level').eq('user_id', userId).maybeSingle()
    .then(({ data }) => {
      const level = (data?.filmons_trust_level as TrustLevel) ?? 'new';
      trustLevelCache.set(userId, level);
      trustLevelInFlight.delete(userId);
      return level;
    })
    .catch(() => { trustLevelInFlight.delete(userId); return 'new' as TrustLevel; });
  trustLevelInFlight.set(userId, promise);
  return promise;
}
