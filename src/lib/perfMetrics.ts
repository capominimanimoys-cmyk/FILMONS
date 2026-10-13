// Lightweight loading measurements, collected in the browser: time until useful content (FCP / LCP),
// layout shift (CLS) and how long data requests take. Nothing leaves the device -- read it in the
// console with `filmonsPerf()` (or look at localStorage "filmons_perf_last" after a page visit).
type Timing = { ms: number; path: string; at: number };
const api: Timing[] = [];
const vitals: { fcp?: number; lcp?: number; cls: number; navMs?: number } = { cls: 0 };

export function recordApiTiming(ms: number, url: string) {
  api.push({ ms: Math.round(ms), path: url.replace(/^https?:\/\/[^/]+/, '').split('?')[0], at: Date.now() });
  if (api.length > 300) api.shift();
}

function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

export function perfSummary() {
  const ms = api.map(t => t.ms);
  return {
    firstContentfulPaintMs: vitals.fcp && Math.round(vitals.fcp),
    largestContentfulPaintMs: vitals.lcp && Math.round(vitals.lcp),
    layoutShift: Number(vitals.cls.toFixed(3)),
    apiRequests: ms.length,
    apiMedianMs: percentile(ms, 50),
    apiP95Ms: percentile(ms, 95),
    slowestRequests: [...api].sort((a, b) => b.ms - a.ms).slice(0, 5).map(t => `${t.ms}ms ${t.path}`),
    connection: (navigator as any).connection?.effectiveType,
  };
}

export function initPerfMetrics() {
  if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') return;
  const observe = (type: string, cb: (entries: PerformanceEntryList) => void) => {
    try { new PerformanceObserver(l => cb(l.getEntries())).observe({ type, buffered: true } as any); } catch { /* unsupported */ }
  };
  observe('paint', es => es.forEach(e => { if (e.name === 'first-contentful-paint') vitals.fcp = e.startTime; }));
  observe('largest-contentful-paint', es => { const last = es[es.length - 1]; if (last) vitals.lcp = last.startTime; });
  observe('layout-shift', es => es.forEach((e: any) => { if (!e.hadRecentInput) vitals.cls += e.value; }));
  (window as any).filmonsPerf = perfSummary;
  const save = () => { try { localStorage.setItem('filmons_perf_last', JSON.stringify({ at: new Date().toISOString(), ...perfSummary() })); } catch { /* ignore */ } };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); });
}
