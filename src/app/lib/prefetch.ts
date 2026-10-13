// Warms the data a card's detail page will ask for, a moment before it is opened: when the pointer
// rests on a card (desktop hover / keyboard focus) or a finger lands on it (touch, only on a good
// connection). It issues the same request the detail page makes, so the page's own read is answered
// from the short-lived response cache. Limited so it can never turn into preloading everything.
import { listingsApi, authApi } from './api';

const recent = new Map<string, number>();
const stamps: number[] = [];
const WINDOW_MS = 10_000;
const MAX_PER_WINDOW = 4;
const SKIP_IF_RECENT_MS = 15_000;

function connectionAllowsPrefetch(): boolean {
  const c = (navigator as any).connection;
  if (!c) return true;
  if (c.saveData) return false;
  return !/(^|-)2g$/.test(String(c.effectiveType || ''));
}

export type PrefetchKind = 'listing' | 'host';

export function prefetch(kind: PrefetchKind, id: string | undefined | null) {
  if (!id || typeof navigator === 'undefined' || !connectionAllowsPrefetch()) return;
  const key = `${kind}:${id}`;
  const now = Date.now();
  if (now - (recent.get(key) ?? 0) < SKIP_IF_RECENT_MS) return;
  while (stamps.length && now - stamps[0] > WINDOW_MS) stamps.shift();
  if (stamps.length >= MAX_PER_WINDOW) return;
  stamps.push(now); recent.set(key, now);
  if (recent.size > 100) recent.delete(recent.keys().next().value as string);
  try {
    if (kind === 'listing') listingsApi.getOne(id).catch(() => {});
    else authApi.getUserById(id).catch(() => {});
  } catch { /* prefetch is best effort */ }
}

/** Spread onto a card's clickable element. */
export const prefetchHandlers = (kind: PrefetchKind, id: string | undefined | null) => ({
  onPointerEnter: (e: { pointerType?: string }) => { if (e.pointerType === 'mouse' || e.pointerType === 'pen') prefetch(kind, id); },
  onFocus: () => prefetch(kind, id),
  onTouchStart: () => prefetch(kind, id),
});
