import { createClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { recordApiTiming } from './perfMetrics';

const supabaseUrl = `https://${projectId}.supabase.co`;
const supabaseAnonKey = publicAnonKey;

// Read resilience for every GET/HEAD to Supabase (REST/RPC reads).
//
// The 5s product rule (CLAUDE.md "Loading rule") is about what the USER SEES --
// a skeleton immediately, and "taking longer than expected + Retry" at 5s
// (PageLoadState / useLoadDeadline). It must NOT kill the request: aborting at
// 4.5s turned every slow-but-working query into an error that pages swallowed
// as an empty list ("no results" even though results exist). So:
//   * a request is only abandoned after READ_TIMEOUT_MS (a genuine hang);
//   * a fast failure (network blip, 5xx, pooler restart) is retried once;
//   * a final failure is announced via 'filmons:read-failed' so the app shows a
//     visible, retryable notice instead of a silent empty state.
// Not applied to: writes (a timed-out write may still commit server-side),
// storage uploads / edge functions / realtime (legitimately long), and the
// admin app (large reports).
export const READ_TIMEOUT_MS = 12000;
const RETRY_IF_FASTER_THAN_MS = 6000;
const RETRY_STATUS = new Set([429, 502, 503, 504, 520, 522, 524]);
const isAdminApp = typeof window !== 'undefined' && (window.location.pathname.startsWith('/admin') || window.location.hostname.startsWith('admin.'));

// At most this many reads are on the wire at once; the rest wait their turn. A burst of dozens of
// requests (a search fanning out, a profile loading everything) saturates the connection pool and
// turns into 429s / gateway timeouts -- which is exactly what the "Some content didn't load" notice
// reports. The timeout clock starts when a request actually leaves, not while it is queued.
const MAX_CONCURRENT_READS = 10;
let activeReads = 0;
const readQueue: Array<() => void> = [];
const acquireReadSlot = (): Promise<void> =>
  activeReads < MAX_CONCURRENT_READS
    ? (activeReads++, Promise.resolve())
    : new Promise<void>(res => readQueue.push(() => { activeReads++; res(); }));
const releaseReadSlot = () => { activeReads--; readQueue.shift()?.(); };

let lastBecameVisibleAt = 0;
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') lastBecameVisibleAt = Date.now(); });
}

// Many components ask for the same thing at once (same profile, same list). An
// identical GET that is already in flight is shared instead of re-sent -- fewer
// requests competing for the connection, so the ones that matter finish sooner.
// Each caller gets its own clone of the response. Skipped when the caller has
// its own AbortSignal (cancelling one must not cancel the others).
const inflight = new Map<string, Promise<Response>>();

// Short-lived copy of recent successful reads, so opening the same page / list again (back button,
// switching tabs, the same query asked by two components a moment apart) is instant instead of another
// round trip. Cleared by ANY write, kept brief, per-user (the auth header is part of the key), and never
// used for things that must be live (messages, notifications).
const RESPONSE_TTL_MS = 20_000;
const MAX_CACHED_BYTES = 400_000;
const LIVE_PATHS = /\/(messages|notifications|conversations|typing|presence|wallets|wallet_transactions|payout_requests|payout_methods|orders|payments|payment_requests)/;
const responseCache = new Map<string, { at: number; body: ArrayBuffer; status: number; statusText: string; headers: [string, string][] }>();
/** Drops every cached read (called on sign-out so one account's data can never show for the next). */
export const clearReadCache = () => { responseCache.clear(); };
const fromCache = (e: { body: ArrayBuffer; status: number; statusText: string; headers: [string, string][] }) =>
  new Response(e.body.slice(0), { status: e.status, statusText: e.statusText, headers: e.headers });

function deadlineFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const m = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  if (m !== 'GET' && m !== 'HEAD') responseCache.clear(); // any write (or edge-function call) makes cached reads suspect
  const u = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (m === 'GET' && !init?.signal && !(input instanceof Request) && u.includes('/rest/v1/') && !isAdminApp) {
    let hdr = '';
    try { hdr = JSON.stringify([...new Headers(init?.headers as HeadersInit | undefined).entries()].sort()); } catch { /* unkeyable -> no sharing */ hdr = '\u0000' + Math.random(); }
    const key = `${u}|${hdr}`;
    const cacheable = !LIVE_PATHS.test(u);
    const hit = cacheable ? responseCache.get(key) : undefined;
    if (hit && Date.now() - hit.at < RESPONSE_TTL_MS) return Promise.resolve(fromCache(hit));
    let p = inflight.get(key);
    if (!p) {
      p = readWithResilience(input, init).finally(() => inflight.delete(key));
      inflight.set(key, p);
      if (cacheable) {
        p.then(res => {
          if (!res.ok || !(res.headers.get('content-type') || '').includes('json')) return;
          const len = Number(res.headers.get('content-length') || 0);
          if (len > MAX_CACHED_BYTES) return;
          res.clone().arrayBuffer().then(body => {
            if (body.byteLength > MAX_CACHED_BYTES) return;
            responseCache.set(key, { at: Date.now(), body, status: res.status, statusText: res.statusText, headers: [...res.headers.entries()] });
            if (responseCache.size > 120) responseCache.delete(responseCache.keys().next().value as string);
          }).catch(() => {});
        }).catch(() => {});
      }
    }
    return p.then(r => r.clone());
  }
  return readWithResilience(input, init);
}

function readWithResilience(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const isRead = (method === 'GET' || method === 'HEAD') && url.includes('/rest/v1/');
  if (!isRead || isAdminApp || typeof AbortController === 'undefined') return fetch(input, init);
  const outer = init?.signal;

  const attempt = async (): Promise<{ res?: Response; err?: unknown; ms: number }> => {
    await acquireReadSlot();
    const ctrl = new AbortController();
    if (outer) { if (outer.aborted) ctrl.abort(); else outer.addEventListener('abort', () => ctrl.abort(), { once: true }); }
    const t = setTimeout(() => ctrl.abort(), READ_TIMEOUT_MS);
    const started = Date.now();
    try {
      const res = await fetch(input, { ...init, signal: ctrl.signal });
      recordApiTiming(Date.now() - started, url);
      return { res, ms: Date.now() - started };
    } catch (err) {
      return { err, ms: Date.now() - started };
    } finally { clearTimeout(t); releaseReadSlot(); }
  };

  return (async () => {
    let r = await attempt();
    const callerAborted = !!outer?.aborted;
    const transient = !callerAborted && (r.err !== undefined || (r.res && RETRY_STATUS.has(r.res.status)));
    // Retry once, but only if the failure was quick -- a request that already
    // burned the whole deadline isn't going to be rescued by waiting again.
    if (transient && r.ms < RETRY_IF_FASTER_THAN_MS) {
      await new Promise(res => setTimeout(res, 400));
      r = await attempt();
    }
    if (r.res && !RETRY_STATUS.has(r.res.status)) return r.res;
    // Announce only failures worth the user's attention: not HEAD count/badge
    // probes, and not while the tab is hidden / just came back (browsers kill
    // in-flight fetches when a tab is backgrounded or the page navigates, which
    // is not a data problem). The banner additionally needs several failures
    // close together before it shows -- see ReadFailureBanner.
    if (!callerAborted && method !== 'HEAD' && typeof window !== 'undefined' && typeof document !== 'undefined'
        && document.visibilityState === 'visible' && Date.now() - lastBecameVisibleAt > 4000) {
      console.warn('[supabase] read failed after retry:', url.replace(/^https?:\/\/[^/]+/, ''), r.res ? `HTTP ${r.res.status}` : String(r.err));
      window.dispatchEvent(new CustomEvent('filmons:read-failed', { detail: { url, status: r.res?.status } }));
    }
    if (r.res) return r.res;      // let supabase-js surface the server's own error body
    throw r.err;
  })();
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: {
    schema: 'public',
  },
  auth: {
    persistSession:      true,
    autoRefreshToken:    true,
    detectSessionInUrl:  true,
  },
  global: {
    fetch: deadlineFetch,
    headers: {
      // Prevent Supabase JS from sending session-level parameters
      // that PgBouncer transaction-mode pooler doesn't support
      'x-connection-encrypted': 'true',
    },
  },
});