/** Resolves with `fallback` if `p` hasn't settled within `ms` (or rejects).
 *  The underlying request keeps running; its late result is just ignored.
 *  Used so a slow secondary lookup can't hold the whole Home feed past ~5s. */
export function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>(resolve => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then(v => { clearTimeout(t); resolve(v); }, () => { clearTimeout(t); resolve(fallback); });
  });
}
