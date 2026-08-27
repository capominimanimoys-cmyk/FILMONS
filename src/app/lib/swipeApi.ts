// Swipe history for the Home discovery deck (SwipeStack.tsx) -- makes a
// left swipe ("pass") a durable skip instead of resetting on every reload,
// and backs the Professional/Business-only Undo feature. See
// supabase/migrations/20240323000000_swipe_history.sql for the table and
// supabase/functions/undo-swipe for the server-side tier check (never
// trust account tier from the client -- same trust model as boostApi's
// entitlement-gated actions elsewhere).
import { supabase } from '../../lib/supabase';
import { projectId, publicAnonKey } from '/utils/supabase/info';

export type SwipeItemType = 'listing' | 'creator';
export type SwipeDirection = 'left' | 'right';

export const swipeApi = {
  /** Fire-and-forget -- called for every swipe, both directions. */
  recordSwipe(userId: string, itemId: string, itemType: SwipeItemType, direction: SwipeDirection): void {
    supabase.from('swipes').insert({
      user_id: userId, item_id: itemId, item_type: itemType, direction,
    }).then(undefined, () => {});
  },

  /** Item ids the user has already left-swiped (and not undone) -- filter
   *  these out of the deck before building it so a refresh/filter switch
   *  never resurfaces something already passed on. */
  async getExcludedIds(userId: string): Promise<Set<string>> {
    try {
      const { data } = await supabase
        .from('swipes')
        .select('item_id')
        .eq('user_id', userId)
        .eq('direction', 'left')
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
