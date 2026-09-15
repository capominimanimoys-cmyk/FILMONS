import { useEffect, useRef, useState } from 'react';

// Same symmetric deadzone-based direction check MobileBottomNav.tsx's own
// dimming effect uses elsewhere in this app -- a meaningful scroll down
// hides the chrome, a meaningful scroll up restores it immediately (the
// user never has to scroll all the way back to the top), and staying
// within a few px of the very top always keeps both bars visible
// regardless of direction (covers a fresh load/tab switch landing at
// scrollTop 0 with no prior delta to compare against).
const TOP_THRESHOLD = 12;
const HIDE_SCROLL_DELTA = 10;
const REVEAL_SCROLL_DELTA = 10;

// Dispatches the same 'filmons:home-bars-hidden' window CustomEvent
// TopBar.tsx, MobileBottomNav.tsx, and Root.tsx's <main> already listen
// for -- originally built for Home's Portfolio feed, extracted here so
// Profile.tsx and HostProfile.tsx get the identical immersive
// scroll-to-hide behavior (including the layout-space collapse those three
// already do on this event) without a second, slightly different
// implementation. Nothing about those three listeners needs to change for
// a new caller to opt in.
//
// mode: 'window' (default) tracks the document/window scroll position
// directly -- right for a plain page with no inner scroll container of its
// own (Profile.tsx, HostProfile.tsx). mode: 'manual' does no listening of
// its own; the caller feeds it scrollTop from its own bounded scroll
// container's onScroll handler via the returned `onManualScroll` (Home's
// Portfolio feed scrolls inside its own div, not the window).
export function useMobileScrollChrome(options: { mode?: 'window' | 'manual'; enabled?: boolean } = {}) {
  const { mode = 'window', enabled = true } = options;
  const lastTopRef = useRef(0);
  const [hidden, setHidden] = useState(false);

  const evaluate = (top: number) => {
    const last = lastTopRef.current;
    if (top <= TOP_THRESHOLD) setHidden(false);
    else if (top > last + HIDE_SCROLL_DELTA) setHidden(true);
    else if (top < last - REVEAL_SCROLL_DELTA) setHidden(false);
    lastTopRef.current = top;
  };

  useEffect(() => {
    if (mode !== 'window' || !enabled) return;
    lastTopRef.current = window.scrollY;
    const onScroll = () => evaluate(window.scrollY);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, enabled]);

  // Disabling (e.g. Home leaving Portfolio mode) must drop any stale
  // `hidden: true` immediately, not just stop dispatching it -- otherwise
  // re-enabling later would start from a leftover hidden state instead of
  // a fresh visible one.
  useEffect(() => { if (!enabled) setHidden(false); }, [enabled]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('filmons:home-bars-hidden', { detail: { hidden: enabled && hidden } }));
  }, [hidden, enabled]);

  // Always restore on unmount so it never lingers true on a page/route that
  // stops using this hook.
  useEffect(() => {
    return () => { window.dispatchEvent(new CustomEvent('filmons:home-bars-hidden', { detail: { hidden: false } })); };
  }, []);

  return { hidden, onManualScroll: evaluate };
}
