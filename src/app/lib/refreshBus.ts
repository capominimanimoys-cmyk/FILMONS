import { useEffect, useRef } from 'react';

// Pull-to-refresh / desktop refresh button plumbing. A page registers a
// handler with `useRefreshHandler(fn)`; fn must refetch IN PLACE (keep the
// current content on screen, swap data when it arrives) and reject on
// failure so the refresh indicator can say "Couldn't refresh".
// Pages with no handler fall back to the app-level remount (see Root.tsx).

type Handler = () => Promise<unknown>;
const handlers = new Set<Handler>();

/** Registers `fn` as this page's refresh handler while mounted. */
export function useRefreshHandler(fn: Handler) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const h: Handler = () => ref.current();
    handlers.add(h);
    return () => { handlers.delete(h); };
  }, []);
}

export function hasRefreshHandlers() { return handlers.size > 0; }

/** Runs every registered handler; rejects if any of them fail. */
export async function runRefreshHandlers(): Promise<void> {
  const results = await Promise.allSettled([...handlers].map(h => h()));
  if (results.some(r => r.status === 'rejected')) throw new Error('refresh failed');
}
