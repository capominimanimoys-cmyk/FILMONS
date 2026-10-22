// One place that says "this post / listing / portfolio work was deleted": every list that might still be showing it
// (Home's Connect feed and cache, the listing deck, discovery caches) drops it at once, and the Activity rows that
// pointed at it are cleaned up so it can't come back on the next load.
import { supabase, clearReadCache } from './supabase';

export type DeletedKind = 'post' | 'listing' | 'portfolio_item' | 'portfolio_album';
export const CONTENT_DELETED_EVENT = 'filmons:content-deleted';

export function announceContentDeleted(kind: DeletedKind, id: string) {
  try { clearReadCache(); } catch { /* ignore */ }
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith('filmons:discovery:')) sessionStorage.removeItem(k);
    }
  } catch { /* storage unavailable */ }
  try { window.dispatchEvent(new CustomEvent(CONTENT_DELETED_EVENT, { detail: { kind, id } })); } catch { /* ignore */ }
  // Best effort: the owner's "published/reposted" activity rows for it (the feed also re-checks the target on read).
  Promise.resolve(supabase.from('activity_events').delete().eq('target_id', id)).catch(() => {});
}
