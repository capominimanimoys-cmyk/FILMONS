import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { Loader2, RotateCw, ArrowDown } from 'lucide-react';
import { hasRefreshHandlers, runRefreshHandlers } from '../lib/refreshBus';

// Pull-to-refresh (touch) + a refresh button (desktop) around the page area.
//  - Only starts when the touch begins with the content scrolled to the very
//    top, and only after a deliberate downward drag (> START_PX, mostly vertical).
//  - Pull shows "Pull to refresh"; past THRESHOLD it flips to "Release to refresh".
//  - On release the spinner shows and the page's registered handlers refetch
//    in place, so existing content stays visible. Failure keeps the content and
//    shows "Couldn't refresh. Try again."
//  - One refresh at a time. Loading more at the bottom is untouched.
const THRESHOLD = 70;
const MAX_PULL = 120;
const START_PX = 12;
// Routes with their own gesture model or in-progress forms.
const EXCLUDED = ['/reels', '/checkout', '/create', '/edit', '/onboarding', '/verification', '/login', '/learning'];

type Phase = 'idle' | 'pulling' | 'refreshing' | 'failed';

/** Nearest ancestor that actually scrolls vertically (or null → the window). */
function scrollParent(el: HTMLElement | null, stop: HTMLElement): HTMLElement | null {
  for (let n = el; n && n !== stop.parentElement; n = n.parentElement) {
    const oy = getComputedStyle(n).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight + 1) return n;
  }
  return null;
}

export function PullToRefresh({ children, onFallbackRefresh, className, style }: {
  children: ReactNode;
  /** Used when the page registered no in-place handler (remounts the page). */
  onFallbackRefresh: () => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const location = useLocation();
  const rootRef = useRef<HTMLElement>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [pull, setPull] = useState(0);
  const busy = useRef(false);
  const pullRef = useRef(0);
  const failTimer = useRef<ReturnType<typeof setTimeout>>();
  const disabled = EXCLUDED.some(p => location.pathname.startsWith(p));

  const doRefresh = useCallback(async () => {
    if (busy.current) return; // one request at a time
    busy.current = true;
    clearTimeout(failTimer.current);
    setPhase('refreshing'); setPull(THRESHOLD * 0.7);
    try {
      if (hasRefreshHandlers()) await runRefreshHandlers();
      else { onFallbackRefresh(); await new Promise(r => setTimeout(r, 700)); }
      window.scrollTo({ top: 0 });
      setPhase('idle'); setPull(0);
    } catch {
      setPhase('failed'); setPull(THRESHOLD * 0.7);
      failTimer.current = setTimeout(() => { setPhase('idle'); setPull(0); }, 4000);
    } finally {
      busy.current = false;
    }
  }, [onFallbackRefresh]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || disabled) return;
    let startY = 0, startX = 0, tracking = false, engaged = false, scroller: HTMLElement | null = null;

    const atTop = () => (scroller ? scroller.scrollTop <= 0 : window.scrollY <= 0);

    const onStart = (e: TouchEvent) => {
      if (busy.current || e.touches.length !== 1) return;
      const target = e.target as HTMLElement;
      if (target.closest('[data-no-ptr], input, textarea, select, [contenteditable="true"], [style*="touch-action: none"]')) return; // own drag gestures (swipe deck, sliders)
      scroller = scrollParent(target, root);
      if (!atTop()) return;
      tracking = true; engaged = false;
      startY = e.touches[0].clientY; startX = e.touches[0].clientX;
    };
    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const dy = e.touches[0].clientY - startY;
      const dx = Math.abs(e.touches[0].clientX - startX);
      if (!engaged) {
        if (dy < 0 || !atTop()) { tracking = false; return; }       // scrolling down the page, not pulling
        if (dx > dy) { tracking = false; return; }                   // horizontal swipe
        if (dy < START_PX) return;                                   // not deliberate yet
        engaged = true;
      }
      if (!atTop()) { tracking = false; engaged = false; setPhase('idle'); setPull(0); return; }
      if (e.cancelable) e.preventDefault();                          // stop the browser's own overscroll
      const resisted = Math.min(MAX_PULL, (dy - START_PX) * 0.5);
      pullRef.current = resisted;
      setPhase('pulling'); setPull(resisted);
    };
    const onEnd = () => {
      if (!tracking) return;
      const wasEngaged = engaged;
      tracking = false; engaged = false;
      if (!wasEngaged) return;
      if (pullRef.current >= THRESHOLD) void doRefresh();
      else { pullRef.current = 0; setPhase('idle'); setPull(0); }
    };

    root.addEventListener('touchstart', onStart, { passive: true });
    root.addEventListener('touchmove', onMove, { passive: false });
    root.addEventListener('touchend', onEnd);
    root.addEventListener('touchcancel', onEnd);
    return () => {
      root.removeEventListener('touchstart', onStart);
      root.removeEventListener('touchmove', onMove);
      root.removeEventListener('touchend', onEnd);
      root.removeEventListener('touchcancel', onEnd);
    };
  }, [disabled, doRefresh]);

  useEffect(() => () => clearTimeout(failTimer.current), []);

  const ready = pull >= THRESHOLD;
  const label = phase === 'refreshing' ? 'Refreshing…'
    : phase === 'failed' ? 'Couldn’t refresh. Try again.'
    : ready ? 'Release to refresh' : 'Pull to refresh';
  const showIndicator = !disabled && phase !== 'idle';

  return (
    <main ref={rootRef} className={className} style={style}>
      {/* Indicator takes space above the content (content is pushed down, never replaced). */}
      <div
        aria-live="polite"
        className="md:hidden overflow-hidden flex items-center justify-center text-xs font-semibold text-gray-500"
        style={{ height: showIndicator ? pull : 0, transition: phase === 'pulling' ? 'none' : 'height 220ms ease' }}
      >
        {showIndicator && (
          <button
            type="button"
            onClick={phase === 'failed' ? () => void doRefresh() : undefined}
            className="flex items-center gap-2"
          >
            {phase === 'refreshing' ? <Loader2 className="w-4 h-4 animate-spin" />
              : phase === 'failed' ? <RotateCw className="w-4 h-4" />
              : <ArrowDown className="w-4 h-4 transition-transform" style={{ transform: ready ? 'rotate(180deg)' : 'none' }} />}
            {label}
          </button>
        )}
      </div>

      {/* Desktop: refresh button */}
      {!disabled && (
        <div className="hidden md:flex fixed bottom-6 right-6 z-30 flex-col items-end gap-2">
          {phase === 'failed' && (
            <span className="text-xs font-semibold text-red-600 bg-white border border-red-100 rounded-full px-3 py-1.5 shadow">Couldn{'’'}t refresh. Try again.</span>
          )}
          <button
            type="button"
            onClick={() => void doRefresh()}
            disabled={phase === 'refreshing'}
            aria-label="Refresh"
            title="Refresh"
            className="w-11 h-11 rounded-full bg-white border border-gray-200 shadow-lg flex items-center justify-center text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            <RotateCw className={`w-4 h-4 ${phase === 'refreshing' ? 'animate-spin' : ''}`} />
          </button>
        </div>
      )}

      {children}
    </main>
  );
}
