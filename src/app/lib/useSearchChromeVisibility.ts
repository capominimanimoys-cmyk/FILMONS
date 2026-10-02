import { useEffect, useRef, useState } from 'react';

// Purpose-built for FILMONS Search headers specifically (not a
// replacement for useMobileScrollChrome.ts, which Profile.tsx/
// HostProfile.tsx/Home.tsx's Portfolio feed/AllGroupedResults already use
// with a different, coarser threshold model -- changing that one risks
// regressing pages this spec never asked about). Direction-threshold
// based (not every 1px): small same-position jitter never flips the
// header, only a MEANINGFUL scroll in one direction does.
const DIRECTION_THRESHOLD = 8;
const TOP_THRESHOLD = 10;

export function useSearchChromeVisibility(options: { inputFocused?: boolean } = {}) {
  const { inputFocused = false } = options;
  const lastYRef = useRef(0);
  // Accumulates same-direction movement since the last direction flip (or
  // threshold trip) -- absorbs small back-and-forth jitter from trackpad/
  // touch momentum instead of flickering on it, reset the instant the
  // user actually reverses direction.
  const accumRef = useRef(0);
  const [scrollHidden, setScrollHidden] = useState(false);

  useEffect(() => {
    lastYRef.current = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - lastYRef.current;
      lastYRef.current = y;
      if (y <= TOP_THRESHOLD) { setScrollHidden(false); accumRef.current = 0; return; }
      if (delta !== 0 && (delta > 0) !== (accumRef.current > 0)) accumRef.current = 0;
      accumRef.current += delta;
      if (accumRef.current > DIRECTION_THRESHOLD) setScrollHidden(true);
      else if (accumRef.current < -DIRECTION_THRESHOLD) setScrollHidden(false);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Keyboard open (search input focused) is its own combined state, not
  // just a pause of the scroll logic: header stays visible, but bottom
  // nav hides regardless of scroll direction -- per spec, a keyboard-open
  // viewport should never show the bottom nav crowding the keyboard, but
  // should also never lose the field the user is actively typing into.
  const headerVisible = inputFocused ? true : !scrollHidden;
  const bottomNavVisible = inputFocused ? false : !scrollHidden;

  // Same 'filmons:home-bars-hidden' event TopBar.tsx/MobileBottomNav.tsx/
  // Root.tsx's <main> already dispatch and listen for -- reusing it is
  // what makes bottom-nav coordination free, no new bottom-nav code.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('filmons:home-bars-hidden', { detail: { hidden: !bottomNavVisible } }));
  }, [bottomNavVisible]);
  useEffect(() => {
    return () => { window.dispatchEvent(new CustomEvent('filmons:home-bars-hidden', { detail: { hidden: false } })); };
  }, []);

  return { headerVisible, bottomNavVisible, direction: scrollHidden ? ('down' as const) : ('up' as const) };
}
