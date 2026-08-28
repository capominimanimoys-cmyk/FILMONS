// Swipe history for the Home discovery deck (SwipeStack.tsx) -- makes a
// left swipe ("pass") a durable skip instead of resetting on every reload,
// backs the Professional/Business-only Undo feature, and enforces the
// daily Like+Pass limit (Creator 10, Creator+ 25, Professional/Business
// unlimited) server-side via record-swipe -- see
// supabase/migrations/20240323000000_swipe_history.sql,
// 20240324000000_swipe_daily_limits.sql, and supabase/functions/
// record-swipe|undo-swipe for the server-side tier checks (never trust
// account tier or a swipe count from the client).
import { supabase } from '../../lib/supabase';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import type { AccountTier } from './reliabilityApi';

export type SwipeItemType = 'listing' | 'creator';
export type SwipeDirection = 'left' | 'right';

export const swipeApi = {
  /** Every Like/Pass goes through this -- never a direct client insert, so
   *  the daily limit can't be bypassed by skipping the edge function. */
  async recordSwipe(userId: string, itemId: string, itemType: SwipeItemType, direction: SwipeDirection): Promise<
    | { ok: true }
    | { ok: false; limitReached: true; tier: AccountTier; limit: number }
    | { ok: false; limitReached: false; reason: string }
  > {
    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/record-swipe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` },
        body: JSON.stringify({ userId, itemId, itemType, direction }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data?.error === 'limit_reached') return { ok: false, limitReached: true, tier: data.tier, limit: data.limit };
        return { ok: false, limitReached: false, reason: data?.error || 'record_failed' };
      }
      return { ok: true };
    } catch {
      return { ok: false, limitReached: false, reason: 'network_error' };
    }
  },

  /** Today's Like+Pass count (UTC day), for the "N / limit swipes used"
   *  display -- read-only, safe client-side per this app's open-RLS
   *  convention; the record-swipe edge function is the real gate. */
  async getTodaySwipeCount(userId: string): Promise<number> {
    try {
      const dayStart = new Date();
      dayStart.setUTCHours(0, 0, 0, 0);
      const { count } = await supabase
        .from('swipes')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', dayStart.toISOString());
      return count || 0;
    } catch {
      return 0;
    }
  },

  /** Item ids the user has already swiped on in either direction (and not
   *  undone) -- filter these out of the deck before building it so a
   *  refresh/filter switch never resurfaces something already acted on.
   *  Right-swipes (likes) are excluded too, not just left-swipes (passes):
   *  once you've made a decision on a card, it shouldn't reappear in the
   *  discovery queue regardless of which way you decided -- a liked
   *  listing is still fully visible via the Liked tab, search, or its own
   *  URL, this only keeps it out of the swipe deck itself. */
  async getExcludedIds(userId: string): Promise<Set<string>> {
    try {
      const { data } = await supabase
        .from('swipes')
        .select('item_id')
        .eq('user_id', userId)
        .eq('undone', false);
      return new Set((data ?? []).map(r => r.item_id as string));
    } catch {
      return new Set();
    }
  },

  /** Professional/Business only -- enforced server-side in undo-swipe, not
   *  just hidden in the UI. Reverses the single most recent swipe. */
  async undoLastSwipe(userId: string): Promise<
    | { ok: true; itemId: string; itemType: SwipeItemType; direction: SwipeDirection }
    | { ok: false; reason: string }
  > {
    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/undo-swipe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!res.ok) return { ok: false, reason: data?.error || 'undo_failed' };
      return { ok: true, itemId: data.itemId, itemType: data.itemType, direction: data.direction };
    } catch {
      return { ok: false, reason: 'network_error' };
    }
  },
};
