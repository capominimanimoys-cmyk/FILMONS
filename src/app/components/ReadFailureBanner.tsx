// Visible, retryable notice when data reads fail for good (after the one
// automatic retry in src/lib/supabase.ts). Exists so a failed load is never
// mistaken for "no results" (CLAUDE.md: errors are visible and retryable).
// Retry remounts the current page, which re-runs all of its loads.
import { useEffect, useRef, useState } from 'react';
import { RotateCcw, WifiOff, X } from 'lucide-react';

export function ReadFailureBanner({ onRetry }: { onRetry: () => void }) {
  const [show, setShow] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();
  const lastDismissed = useRef(0);

  useEffect(() => {
    // One stray failed request (a slow secondary lookup, a flaky moment) is not
    // worth interrupting anyone for -- the banner needs several close together.
    const recent: number[] = [];
    const onFail = () => {
      const now = Date.now();
      recent.push(now);
      while (recent.length && now - recent[0] > 10_000) recent.shift();
      if (recent.length < 3) return;
      if (now - lastDismissed.current < 60_000) return; // don't nag right after dismissal
      setShow(true);
      clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setShow(false), 20_000);
    };
    const onOnline = () => setShow(false);
    window.addEventListener('filmons:read-failed', onFail);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('filmons:read-failed', onFail);
      window.removeEventListener('online', onOnline);
      clearTimeout(hideTimer.current);
    };
  }, []);

  if (!show) return null;
  const dismiss = () => { lastDismissed.current = Date.now(); setShow(false); };
  return (
    <div role="alert" className="fixed left-1/2 -translate-x-1/2 z-[90] w-[calc(100%-2rem)] max-w-md bottom-24 md:bottom-6">
      <div className="flex items-center gap-3 rounded-2xl bg-gray-900 text-white shadow-xl px-4 py-3">
        <WifiOff className="w-4 h-4 shrink-0 text-amber-300" />
        <p className="flex-1 text-xs leading-snug">Some content didn’t load. What you see may be incomplete.</p>
        <button
          onClick={() => { setShow(false); onRetry(); }}
          className="shrink-0 inline-flex items-center gap-1 rounded-full bg-white text-gray-900 text-xs font-bold px-3 py-1.5"
        >
          <RotateCcw className="w-3 h-3" /> Retry
        </button>
        <button onClick={dismiss} aria-label="Dismiss" className="shrink-0 text-white/60 hover:text-white"><X className="w-4 h-4" /></button>
      </div>
    </div>
  );
}
