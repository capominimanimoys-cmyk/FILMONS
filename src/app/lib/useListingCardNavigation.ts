// Index/navigation state for the desktop ListingCardStack — separate from
// SwipeStack's own `idx` state since the two decks render independently
// (mobile keeps using SwipeStack's swipe-to-like/pass gestures; desktop is
// pure prev/next browsing, per the "not like/dislike, just browsing" spec).
import { useState, useEffect, useCallback } from 'react';

export function useListingCardNavigation(length: number) {
  const [idx, setIdx] = useState(0);

  // Clamp back into range when the underlying deck shrinks/changes (filter
  // switch, data refresh) so idx never points past the end.
  useEffect(() => {
    setIdx(i => Math.min(i, Math.max(0, length - 1)));
  }, [length]);

  const goNext = useCallback(() => setIdx(i => Math.min(i + 1, Math.max(0, length - 1))), [length]);
  const goPrev = useCallback(() => setIdx(i => Math.max(i - 1, 0)), []);
  const goTo   = useCallback((i: number) => setIdx(Math.max(0, Math.min(i, Math.max(0, length - 1)))), [length]);

  return {
    idx,
    goNext,
    goPrev,
    goTo,
    isFirst: idx <= 0,
    isLast: idx >= length - 1,
  };
}
