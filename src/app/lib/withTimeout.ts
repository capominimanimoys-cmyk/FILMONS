/** Resolves with `fallback` if `p` hasn't settled within `ms` (or rejects).
 *  The underlying request keeps running. If it later succeeds, `onLate` is
 *  called with the real value so the caller can replace the fallback -- a slow
 *  answer must never be thrown away and shown as "no results".
 *  Used so a slow lookup can't hold a page past ~5s while still letting the
 *  real data arrive when it does. */
export function withTimeout<T>(p: Promise<T>, ms: number, fallback: T, onLate?: (value: T) => void): Promise<T> {
  return new Promise<T>(resolve => {
    let settled = false;
    const t = setTimeout(() => { settled = true; resolve(fallback); }, ms);
    p.then(
      v => { if (settled) { onLate?.(v); return; } clearTimeout(t); resolve(v); },
      () => { if (!settled) { clearTimeout(t); resolve(fallback); } },
    );
  });
}
