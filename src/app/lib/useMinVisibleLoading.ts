import { useEffect, useRef, useState } from 'react';

/**
 * Floors how long a loading indicator stays visible once it appears, so a
 * fast response doesn't flash the rotation loader for an imperceptible
 * instant. Mirrors FilmonsLoader's MIN_VISIBLE_MS pattern, generalized for
 * the section-level FilmonsBrandLoader spinners used across the app.
 */
export function useMinVisibleLoading(isLoading: boolean, minMs = 400): boolean {
  const [visible, setVisible] = useState(isLoading);
  const shownAtRef = useRef<number | null>(isLoading ? Date.now() : null);

  useEffect(() => {
    if (isLoading) {
      shownAtRef.current = Date.now();
      setVisible(true);
      return;
    }
    const elapsed = shownAtRef.current ? Date.now() - shownAtRef.current : minMs;
    const remaining = Math.max(0, minMs - elapsed);
    const t = setTimeout(() => setVisible(false), remaining);
    return () => clearTimeout(t);
  }, [isLoading, minMs]);

  return visible;
}
