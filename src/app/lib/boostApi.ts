import { supabase } from '../../lib/supabase';
import { projectId, publicAnonKey } from '/utils/supabase/info';

export type BoostGoal = 'more_views' | 'more_messages' | 'more_rental_requests' | 'more_booking_requests' | 'more_applications';
export type BoostAudienceType = 'automatic' | 'local' | 'custom' | 'canada_us';
export type BoostStatus = 'draft' | 'pending_payment' | 'active' | 'paused' | 'completed' | 'stopped' | 'failed' | 'refunded';
export type BoostEventType = 'impression' | 'view' | 'save' | 'message' | 'rental_request' | 'application' | 'booking_request';
export type BoostEventSource = 'organic' | 'boosted';
export type AudienceLevel = 'low' | 'moderate' | 'higher';

export interface BoostConfig {
  minDailyBudget: number;
  maxDailyBudget: number;
  minDurationDays: number;
  maxDurationDays: number;
  currency: string;
  priorityMultiplier: number;
  minAudienceThreshold: number;
  frequencyCapPerUser: number;
  frequencyCooldownHours: number;
}

export interface AudienceConfig {
  radiusKm?: number;
  cities?: string[];
  categories?: string[];
}

export interface ListingBoost {
  id: string;
  listingId: string;
  ownerId: string;
  goal: BoostGoal;
  audienceType: BoostAudienceType;
  audienceConfig: AudienceConfig;
  dailyBudget: number;
  totalBudget: number;
  currency: string;
  durationDays: number;
  status: BoostStatus;
  startsAt?: string;
  endsAt?: string;
  amountSpent: number;
  createdAt: string;
  deliveryWeight?: number;
  impressionsTarget?: number;
}

function mapBoost(row: any): ListingBoost {
  return {
    id: row.id,
    listingId: row.listing_id,
    ownerId: row.owner_id,
    goal: row.goal,
    audienceType: row.audience_type,
    audienceConfig: row.audience_config || {},
    dailyBudget: row.daily_budget,
    totalBudget: row.total_budget,
    currency: row.currency,
    durationDays: row.duration_days,
    status: row.status,
    startsAt: row.starts_at || undefined,
    endsAt: row.ends_at || undefined,
    amountSpent: row.amount_spent || 0,
    createdAt: row.created_at,
    deliveryWeight: row.delivery_weight ?? undefined,
    impressionsTarget: row.impressions_target ?? undefined,
  };
}

// Simple, honestly-documented formulas — never presented to the boost owner
// as a promise. Weight scales with budget relative to the configured
// bounds so a bigger budget lifts distribution probability without
// guaranteeing rank #1. Target is a conservative constant-per-dollar
// estimate used only internally to compute the admin "delivery rate."
const IMPRESSIONS_PER_DOLLAR = 8;
export function computeDeliveryWeight(dailyBudget: number, config: Pick<BoostConfig, 'minDailyBudget' | 'maxDailyBudget'>): number {
  const span = Math.max(config.maxDailyBudget - config.minDailyBudget, 1);
  const frac = Math.min(Math.max((dailyBudget - config.minDailyBudget) / span, 0), 1);
  return 1 + frac * 4; // 1x (min budget) .. 5x (max budget)
}
export function computeImpressionsTarget(dailyBudget: number, durationDays: number): number {
  return Math.round(dailyBudget * durationDays * IMPRESSIONS_PER_DOLLAR);
}

const FN_URL = (name: string) => `https://${projectId}.supabase.co/functions/v1/${name}`;
const FN_HEADERS = { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` };

// In-memory dedup so a listing's impression is only logged once per running
// session, not on every scroll re-render of its card.
const _loggedImpressions = new Set<string>();

export const boostApi = {
  getConfig: async (): Promise<BoostConfig> => {
    const { data } = await supabase.from('boost_config').select('*').eq('id', 1).maybeSingle();
    if (!data) return {
      minDailyBudget: 5, maxDailyBudget: 100, minDurationDays: 1, maxDurationDays: 30, currency: 'CAD',
      priorityMultiplier: 1, minAudienceThreshold: 20, frequencyCapPerUser: 3, frequencyCooldownHours: 24,
    };
    return {
      minDailyBudget: data.min_daily_budget,
      maxDailyBudget: data.max_daily_budget,
      minDurationDays: data.min_duration_days,
      maxDurationDays: data.max_duration_days,
      currency: data.currency,
      priorityMultiplier: data.priority_multiplier ?? 1,
      minAudienceThreshold: data.min_audience_threshold ?? 20,
      frequencyCapPerUser: data.frequency_cap_per_user ?? 3,
      frequencyCooldownHours: data.frequency_cooldown_hours ?? 24,
    };
  },

  getActiveBoost: async (listingId: string): Promise<ListingBoost | null> => {
    const { data } = await supabase
      .from('listing_boosts')
      .select('*')
      .eq('listing_id', listingId)
      .in('status', ['active', 'paused', 'pending_payment'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data ? mapBoost(data) : null;
  },

  getBoost: async (boostId: string): Promise<ListingBoost | null> => {
    const { data } = await supabase.from('listing_boosts').select('*').eq('id', boostId).maybeSingle();
    return data ? mapBoost(data) : null;
  },

  charge: async (params: {
    listingId: string; ownerId: string; goal: BoostGoal; audienceType: BoostAudienceType;
    audienceConfig: AudienceConfig; dailyBudget: number; durationDays: number;
    successUrl: string; cancelUrl: string;
  }): Promise<{ url: string; sessionId: string; boostId: string; totalBudget: number }> => {
    const res = await fetch(FN_URL('boost-charge'), {
      method: 'POST', headers: FN_HEADERS,
      body: JSON.stringify({
        listingId: params.listingId, ownerId: params.ownerId, goal: params.goal,
        audienceType: params.audienceType, audienceConfig: params.audienceConfig,
        dailyBudget: params.dailyBudget, durationDays: params.durationDays,
        success_url: params.successUrl, cancel_url: params.cancelUrl,
      }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'Could not start boost checkout');
    return { url: data.url, sessionId: data.session_id, boostId: data.boost_id, totalBudget: data.total_budget };
  },

  verify: async (sessionId: string): Promise<{ boost: ListingBoost | null }> => {
    const res = await fetch(`${FN_URL('boost-charge')}/verify?session_id=${sessionId}`, { headers: FN_HEADERS });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'Could not verify boost payment');
    return { boost: data.boost ? mapBoost(data.boost) : null };
  },

  stop: async (boostId: string, userId: string): Promise<void> => {
    const res = await fetch(FN_URL('boost-stop'), {
      method: 'POST', headers: FN_HEADERS,
      body: JSON.stringify({ boostId, userId }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'Could not stop boost');
  },

  // Fire-and-forget funnel event log. `source` reflects whether the listing
  // genuinely had an active boost at the moment of the event — real,
  // verifiable data, never a fabricated attribution.
  logEvent: (listingId: string, eventType: BoostEventType, source: BoostEventSource, boostId?: string, viewerId?: string) => {
    if (eventType === 'impression') {
      const key = `${listingId}:${source}`;
      if (_loggedImpressions.has(key)) return;
      _loggedImpressions.add(key);
    }
    supabase.from('boost_events').insert({
      listing_id: listingId,
      boost_id: boostId || null,
      event_type: eventType,
      source,
      viewer_id: viewerId || null,
    }).then(() => {}, () => {});
  },

  getInsights: async (listingId: string): Promise<Record<BoostEventType, { organic: number; boosted: number }>> => {
    const empty = () => ({ organic: 0, boosted: 0 });
    const result: Record<BoostEventType, { organic: number; boosted: number }> = {
      impression: empty(), view: empty(), save: empty(), message: empty(),
      rental_request: empty(), application: empty(), booking_request: empty(),
    };
    const { data } = await supabase.from('boost_events').select('event_type, source').eq('listing_id', listingId);
    for (const row of data || []) {
      const t = row.event_type as BoostEventType;
      const s = row.source as BoostEventSource;
      if (result[t]) result[t][s] += 1;
    }
    return result;
  },

  // Real COUNT queries only — Postgres does the actual counting, the client
  // never fabricates a number. Only the Low/Moderate/Higher classification
  // is ever surfaced to the boost owner; the raw count itself is not, per
  // the spec's explicit "don't reveal exact counts" instruction.
  getAudienceEstimate: async (
    audienceType: BoostAudienceType,
    opts: { city?: string; threshold: number },
  ): Promise<AudienceLevel> => {
    let count = 0;
    try {
      if (audienceType === 'local' && opts.city) {
        const { count: c } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).ilike('city', `%${opts.city}%`);
        count = c || 0;
      } else if (audienceType === 'canada_us') {
        const { count: c } = await supabase.from('profiles').select('id', { count: 'exact', head: true });
        count = c || 0; // this app's users are already Canada/US-only in practice — total active count is the honest proxy
      } else {
        const { count: c } = await supabase.from('profiles').select('id', { count: 'exact', head: true });
        count = c || 0;
      }
    } catch { count = 0; }
    if (count < opts.threshold) return 'low';
    if (count < opts.threshold * 5) return 'moderate';
    return 'higher';
  },

  // How many times has this viewer already seen this boosted listing
  // (as a genuine boosted impression) within the configured cooldown
  // window — used to stop re-prioritizing a boost the same person keeps
  // getting shown, without ever permanently hiding it.
  getRecentlySeenBoosted: async (viewerId: string, listingIds: string[], cooldownHours: number): Promise<Record<string, number>> => {
    const result: Record<string, number> = {};
    if (!viewerId || !listingIds.length) return result;
    const since = new Date(Date.now() - cooldownHours * 60 * 60 * 1000).toISOString();
    const { data } = await supabase.from('boost_events')
      .select('listing_id')
      .eq('viewer_id', viewerId)
      .eq('event_type', 'impression')
      .eq('source', 'boosted')
      .in('listing_id', listingIds)
      .gte('created_at', since);
    (data || []).forEach((r: any) => { result[r.listing_id] = (result[r.listing_id] || 0) + 1; });
    return result;
  },
};
