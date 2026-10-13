// Last-seen posts / portfolio per profile, kept in memory for the session so reopening a profile
// paints immediately (stale-while-revalidate) while fresh data loads behind it.
const TTL_MS = 10 * 60_000;
const store = new Map<string, { at: number; value: unknown }>();

export function readProfileCache<T>(kind: 'posts' | 'portfolio', userId: string): T | null {
  const hit = store.get(`${kind}:${userId}`);
  return hit && Date.now() - hit.at < TTL_MS ? (hit.value as T) : null;
}
export function writeProfileCache(kind: 'posts' | 'portfolio', userId: string, value: unknown) {
  store.set(`${kind}:${userId}`, { at: Date.now(), value });
  if (store.size > 30) store.delete(store.keys().next().value as string);
}
