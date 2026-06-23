/**
 * Filmons Reliability & Trust System
 *
 * Account hierarchy (each tier inherits all below):
 *   creator       → basic platform participation
 *   creator_plus  → verified marketplace foundation (requires ID + selfie + payout verification)
 *   professional  → requires creator_plus + portfolio review + professional fee
 *   business      → requires professional + business documents + company validation
 *
 * Trust dimensions:
 *   creator      → Renter trust only
 *   creator_plus → Renter (30%) + Host (30%) + Service (30%) + Verification auto-100 (10%)
 *   professional → same as creator_plus + Professional trust layer (credibility)
 *   business     → same as professional + Operational/Business trust layer
 */
import { supabase } from '../../lib/supabase';

export type AccountTier = 'creator' | 'creator_plus' | 'professional' | 'business';

// ─── canonical helpers ────────────────────────────────────────────────────────
/** Normalize legacy account_type strings to canonical tier */
export function normalizeTier(t?: string): AccountTier {
  if (t === 'business')                              return 'business';
  if (t === 'professional')                          return 'professional';
  if (t === 'creator_plus' || t === 'service')       return 'creator_plus';
  if (t === 'creator'      || t === 'renter')        return 'creator';
  return 'creator'; // default
}

/** Is the account at Creator+ tier or above? (marketplace participant) */
export function isCreatorPlus(t?: string): boolean {
  const tier = normalizeTier(t);
  return tier === 'creator_plus' || tier === 'professional' || tier === 'business';
}

/** Is the account at Professional tier or above? */
export function isProfessional(t?: string): boolean {
  const tier = normalizeTier(t);
  return tier === 'professional' || tier === 'business';
}

/** Is the account at Business tier? */
export function isBusiness(t?: string): boolean {
  return normalizeTier(t) === 'business';
}

/** Display label for account tier */
export function getTierLabel(t?: string): string {
  const tier = normalizeTier(t);
  if (tier === 'business')     return 'Business';
  if (tier === 'professional') return 'Professional';
  if (tier === 'creator_plus') return 'Creator+';
  return 'Creator';
}

/** Badge label shown on profile */
export function getTierBadge(t?: string): string | null {
  const tier = normalizeTier(t);
  if (tier === 'business')     return '✓ Verified Business';
  if (tier === 'professional') return '✓ Verified Professional';
  if (tier === 'creator_plus') return '✓ Verified Creator+';
  return null;
}

// ─── score schema ─────────────────────────────────────────────────────────────
export interface ReputationScore {
  user_id: string;
  account_type: string;
  // Composite
  reliability_score: number;
  reliability_level: string;
  // Renter (all tiers)
  renter_score: number; renter_level: string;
  completed_collabs: number; gear_returned_ontime: number; damage_claims: number;
  late_returns: number; collab_cancels: number; ghosting_count: number;
  failed_payments: number; successful_payments: number;
  renter_reviews_count: number; renter_avg_rating: number;
  collab_pts: number; rental_pts: number; review_pts: number;
  payment_pts: number; renter_penalty_pts: number;
  // Host (Creator+ and above)
  host_score: number; host_level: string;
  rentals_hosted: number; host_cancels: number; fake_listing_reports: number;
  equipment_disputes: number; successful_orders: number;
  host_reviews_count: number; host_avg_rating: number;
  host_service_pts: number; host_review_pts: number; host_penalty_pts: number;
  // Service (Creator+ and above)
  service_score: number; service_level: string;
  completed_services: number; on_time_deliveries: number; repeat_clients: number;
  missed_bookings: number; client_complaints: number; late_deliveries: number;
  service_reviews_count: number; service_avg_rating: number;
  service_delivery_pts: number; service_review_pts: number; service_penalty_pts: number;
  // Verification
  identity_verified: boolean; professional_verified: boolean; business_verified: boolean;
  verification_score: number;
  // Response
  response_rate: number;
  updated_at: string;
}

export interface ReputationEvent {
  id: string; event_type: string; dimension: string;
  score_delta: number; reason: string; created_at: string;
}
export interface TrustBadge { badge_type: string; dimension: string; earned_at: string; }

// ─── tier definitions ─────────────────────────────────────────────────────────

/** Creator (renter/collaborator) tier levels */
export const CREATOR_TIERS: Record<string, {
  label: string; emoji: string; color: string; bg: string;
  border: string; min: number; max: number; description: string;
}> = {
  new_user:        { label:'New Creator',      emoji:'🆕', color:'text-gray-500',   bg:'bg-gray-50',   border:'border-gray-200',  min:0,  max:9,   description:'Complete your first activity to start building trust' },
  building_trust:  { label:'Building Trust',   emoji:'🌱', color:'text-blue-600',   bg:'bg-blue-50',   border:'border-blue-200',  min:10, max:29,  description:'Making progress — keep completing verified activity'  },
  reliable:        { label:'Reliable Creator', emoji:'✅', color:'text-teal-700',   bg:'bg-teal-50',   border:'border-teal-200',  min:30, max:59,  description:'Solid record — standard rental access'               },
  trusted_creator: { label:'Trusted Creator',  emoji:'⭐', color:'text-purple-700', bg:'bg-purple-50', border:'border-purple-200',min:60, max:84,  description:'High trust — priority collaborations'                },
  elite:           { label:'Elite Creator',    emoji:'🏆', color:'text-yellow-700', bg:'bg-yellow-50', border:'border-yellow-200',min:85, max:100, description:'Top tier — instant booking access'                   },
};

/** Creator+ / Professional / Business composite tier levels */
export const CREATOR_PLUS_TIERS: Record<string, {
  label: string; emoji: string; color: string; bg: string;
  border: string; min: number; max: number; description: string;
}> = {
  // Level 0 — recently activated Creator+, verification done, limited history
  new_creator_plus:      { label:'New Creator+',       emoji:'🆕', color:'text-gray-500',   bg:'bg-gray-50',    border:'border-gray-200',  min:0,  max:19,  description:'Verified marketplace participant — complete your first booking or hosting activity' },
  // Level 1 — first marketplace activity, building history
  building_trust:        { label:'Building Trust',     emoji:'🌱', color:'text-blue-600',   bg:'bg-blue-50',    border:'border-blue-200',  min:20, max:49,  description:'First bookings, rentals, and reviews coming in — keep building your record'   },
  // Level 2 — consistent professional behavior
  reliable_creator_plus: { label:'Reliable Creator+',  emoji:'✅', color:'text-teal-700',   bg:'bg-teal-50',    border:'border-teal-200',  min:50, max:74,  description:'Consistent hosting and service quality — featured listing eligibility'       },
  // Level 3 — highly trusted, strong metrics
  trusted_creator_plus:  { label:'Trusted Creator+',   emoji:'⭐', color:'text-purple-700', bg:'bg-purple-50',  border:'border-purple-200',min:75, max:89,  description:'High marketplace trust — lower fees, faster payouts, boosted ranking'       },
  // Level 4 — top-tier marketplace professional
  elite_creator_plus:    { label:'Elite Creator+',     emoji:'🏆', color:'text-yellow-700', bg:'bg-yellow-50',  border:'border-yellow-200',min:90, max:100, description:'Top-tier professional — featured placement, instant booking priority'       },
};

/** Host dimension levels */
export const HOST_TIERS: Record<string, {
  label: string; emoji: string; color: string; bg: string; border: string; description: string;
}> = {
  untrusted_host: { label:'Untrusted Host',   emoji:'⚠️', color:'text-red-600',    bg:'bg-red-50',    border:'border-red-200',    description:'Build trust before hosting premium gear' },
  new_host:       { label:'New Host',         emoji:'🏠', color:'text-blue-600',   bg:'bg-blue-50',   border:'border-blue-200',   description:'Getting started as a host' },
  reliable_host:  { label:'Reliable Host',    emoji:'✅', color:'text-teal-700',   bg:'bg-teal-50',   border:'border-teal-200',   description:'Consistent host — featured placement eligible' },
  trusted_host:   { label:'Trusted Host',     emoji:'⭐', color:'text-purple-700', bg:'bg-purple-50', border:'border-purple-200', description:'High trust — lower fees, faster payouts' },
  elite_marketplace:{ label:'Elite Host',     emoji:'🏆', color:'text-yellow-700', bg:'bg-yellow-50', border:'border-yellow-200', description:'Top marketplace professional' },
};

/** Service dimension levels */
export const SERVICE_TIERS: Record<string, {
  label: string; emoji: string; color: string; bg: string; border: string; description: string;
}> = {
  new_provider:      { label:'New Provider',      emoji:'🎬', color:'text-gray-600',   bg:'bg-gray-50',   border:'border-gray-200',   description:'Complete your first service booking' },
  building_service:  { label:'Building Rep.',     emoji:'🌱', color:'text-blue-600',   bg:'bg-blue-50',   border:'border-blue-200',   description:'Growing service credibility' },
  reliable_provider: { label:'Reliable Provider', emoji:'✅', color:'text-teal-700',   bg:'bg-teal-50',   border:'border-teal-200',   description:'Consistent service delivery' },
  trusted_provider:  { label:'Trusted Provider',  emoji:'⭐', color:'text-purple-700', bg:'bg-purple-50', border:'border-purple-200', description:'High client satisfaction' },
  elite_provider:    { label:'Elite Provider',    emoji:'🏆', color:'text-yellow-700', bg:'bg-yellow-50', border:'border-yellow-200', description:'Premium professional service provider' },
};

// ─── score breakdown config ───────────────────────────────────────────────────
export const RENTER_BREAKDOWN = [
  { key:'collab_pts',  label:'Collaborations',     icon:'🎬', cap:30, color:'#2563eb' },
  { key:'rental_pts',  label:'Rental Reliability', icon:'📦', cap:25, color:'#7c3aed' },
  { key:'review_pts',  label:'Reviews',            icon:'⭐', cap:20, color:'#d97706' },
  { key:'payment_pts', label:'Payments',           icon:'💳', cap:5,  color:'#0891b2' },
] as const;

export const HOST_BREAKDOWN = [
  { key:'host_service_pts', label:'Hosting Activity', icon:'🏠', cap:50, color:'#2563eb'  },
  { key:'host_review_pts',  label:'Host Reviews',     icon:'⭐', cap:30, color:'#d97706'  },
] as const;

export const SERVICE_BREAKDOWN = [
  { key:'service_delivery_pts', label:'Service Delivery', icon:'🎯', cap:60, color:'#7c3aed' },
  { key:'service_review_pts',   label:'Client Reviews',   icon:'⭐', cap:30, color:'#d97706' },
] as const;

// ─── event config ─────────────────────────────────────────────────────────────
export const EVENT_CONFIG: Record<string, {
  label: string; delta: number; dimension: 'renter'|'host'|'service'|'shared';
}> = {
  // Shared verification events
  identity_verified:      { label:'Identity verified',            delta:+10, dimension:'shared'  },
  professional_verified:  { label:'Professional credentials',     delta:+15, dimension:'shared'  },
  business_verified:      { label:'Business registration',        delta:+10, dimension:'shared'  },
  // Renter events (all tiers)
  project_completed:      { label:'Collaboration completed',       delta:+3,  dimension:'renter'  },
  collab_review_positive: { label:'Positive collaboration review', delta:+2,  dimension:'renter'  },
  gear_returned_ontime:   { label:'Gear returned on time',         delta:+5,  dimension:'renter'  },
  no_damage_clean:        { label:'Clean return — no damage',      delta:+2,  dimension:'renter'  },
  high_response_rate:     { label:'High response rate',            delta:+1,  dimension:'renter'  },
  payment_success:        { label:'Payment completed',             delta:+1,  dimension:'renter'  },
  collab_cancel:          { label:'Collaboration cancelled',        delta:-5,  dimension:'renter'  },
  ghosting:               { label:'No-show / ghosting',            delta:-10, dimension:'renter'  },
  late_return:            { label:'Gear returned late',            delta:-8,  dimension:'renter'  },
  damage_claim:           { label:'Gear damage reported',          delta:-20, dimension:'renter'  },
  payment_failed:         { label:'Payment failed',                delta:-10, dimension:'renter'  },
  scam_report:            { label:'Scam or fraud report',          delta:-50, dimension:'renter'  },
  // Host events (Creator+ and above)
  rental_hosted_success:  { label:'Rental hosted successfully',    delta:+4,  dimension:'host'    },
  host_review_positive:   { label:'Positive host review',          delta:+3,  dimension:'host'    },
  fast_approval:          { label:'Fast booking approval',         delta:+1,  dimension:'host'    },
  accurate_listing:       { label:'Listing accuracy confirmed',    delta:+2,  dimension:'host'    },
  host_cancel:            { label:'Host-initiated cancellation',   delta:-10, dimension:'host'    },
  fake_listing:           { label:'Fake or misleading listing',    delta:-25, dimension:'host'    },
  poor_equipment:         { label:'Poor equipment condition',      delta:-15, dimension:'host'    },
  repeated_disputes:      { label:'Repeated dispute pattern',      delta:-20, dimension:'host'    },
  // Service events (Creator+ and above)
  service_completed:      { label:'Service booking completed',     delta:+5,  dimension:'service' },
  client_review_positive: { label:'Positive client review',        delta:+3,  dimension:'service' },
  on_time_delivery:       { label:'On-time service delivery',      delta:+2,  dimension:'service' },
  repeat_client:          { label:'Repeat client booking',         delta:+4,  dimension:'service' },
  missed_booking:         { label:'Missed booking',                delta:-15, dimension:'service' },
  client_complaint:       { label:'Client complaint',              delta:-10, dimension:'service' },
  late_delivery:          { label:'Late service delivery',         delta:-5,  dimension:'service' },
  service_scam:           { label:'Service scam / fraud',          delta:-50, dimension:'service' },
};

// ─── tier resolution ──────────────────────────────────────────────────────────
export function getCompositeTier(level: string, plus: boolean) {
  if (plus) return CREATOR_PLUS_TIERS[level] ?? CREATOR_PLUS_TIERS.new_creator_plus;
  return CREATOR_TIERS[level] ?? CREATOR_TIERS.new_user;
}

export function scoreColor(score: number): string {
  if (score >= 85) return '#b45309';
  if (score >= 60) return '#7c3aed';
  if (score >= 30) return '#0f766e';
  if (score >= 10) return '#2563eb';
  return '#9ca3af';
}

export function nextTierInfo(score: number, plus: boolean): { label: string; pointsNeeded: number } | null {
  const map = plus
    ? [[20,'Building Trust'],[50,'Reliable Creator+'],[75,'Trusted Creator+'],[90,'Elite Creator+']]
    : [[10,'Building Trust'],[30,'Reliable Creator'],[60,'Trusted Creator'],[85,'Elite Creator']];
  for (const [min, label] of map as [number, string][]) {
    if (score < min) return { label, pointsNeeded: min - score };
  }
  return null;
}

// ─── default score ─────────────────────────────────────────────────────────────
const DEFAULT: ReputationScore = {
  user_id:'', account_type:'creator', reliability_score:0, reliability_level:'new_user',
  renter_score:0, renter_level:'new_user', completed_collabs:0, gear_returned_ontime:0,
  damage_claims:0, late_returns:0, collab_cancels:0, ghosting_count:0,
  failed_payments:0, successful_payments:0, renter_reviews_count:0, renter_avg_rating:0,
  collab_pts:0, rental_pts:0, review_pts:0, payment_pts:0, renter_penalty_pts:0,
  host_score:0, host_level:'untrusted_host', rentals_hosted:0, host_cancels:0,
  fake_listing_reports:0, equipment_disputes:0, successful_orders:0,
  host_reviews_count:0, host_avg_rating:0, host_service_pts:0, host_review_pts:0, host_penalty_pts:0,
  service_score:0, service_level:'new_provider', completed_services:0, on_time_deliveries:0,
  repeat_clients:0, missed_bookings:0, client_complaints:0, late_deliveries:0,
  service_reviews_count:0, service_avg_rating:0,
  service_delivery_pts:0, service_review_pts:0, service_penalty_pts:0,
  identity_verified:false, professional_verified:false, business_verified:false,
  verification_score:0, response_rate:100, updated_at: new Date().toISOString(),
};

// ─── API ──────────────────────────────────────────────────────────────────────
export const reliabilityApi = {
  async getScore(userId: string): Promise<ReputationScore> {
    const { data } = await supabase.from('reputation_scores').select('*').eq('user_id', userId).maybeSingle();
    if (data) return data as ReputationScore;
    await supabase.from('reputation_scores').insert({ user_id: userId, account_type: 'creator' });
    return { ...DEFAULT, user_id: userId };
  },

  async getEvents(userId: string, limit = 12): Promise<ReputationEvent[]> {
    const { data } = await supabase.from('reputation_events').select('*')
      .eq('user_id', userId).order('created_at', { ascending: false }).limit(limit);
    return (data || []) as ReputationEvent[];
  },

  async getBadges(userId: string): Promise<TrustBadge[]> {
    const { data } = await supabase.from('trust_badges').select('*')
      .eq('user_id', userId).order('earned_at', { ascending: false });
    return (data || []) as TrustBadge[];
  },

  async logEvent(userId: string, eventType: string, relatedId?: string): Promise<void> {
    const ev = EVENT_CONFIG[eventType];
    if (!ev) { console.warn('[reliabilityApi] unknown event:', eventType); return; }
    await supabase.from('reputation_events').insert({
      user_id: userId, event_type: eventType, dimension: ev.dimension,
      score_delta: ev.delta, reason: ev.label,
      related_id: relatedId ?? null, verified: true,
    });
  },
};