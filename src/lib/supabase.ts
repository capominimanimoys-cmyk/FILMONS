import { createClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from '/utils/supabase/info';

const supabaseUrl = `https://${projectId}.supabase.co`;
const supabaseAnonKey = publicAnonKey;

// Global read deadline: every GET/HEAD to Supabase (REST/RPC reads) is aborted
// after READ_TIMEOUT_MS so a slow or hung query surfaces as an error the page
// can show/retry, instead of an endless spinner. Product rule: no page may be
// stuck loading for more than 5s (see CLAUDE.md "Loading rule").
// Not applied to: writes (a timed-out write may still commit server-side),
// storage uploads / edge functions / realtime (legitimately long), and the
// admin app (large reports).
export const READ_TIMEOUT_MS = 4500;
const isAdminApp = typeof window !== 'undefined' && (window.location.pathname.startsWith('/admin') || window.location.hostname.startsWith('admin.'));

function deadlineFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const isRead = (method === 'GET' || method === 'HEAD') && url.includes('/rest/v1/');
  if (!isRead || isAdminApp || typeof AbortController === 'undefined') return fetch(input, init);
  const ctrl = new AbortController();
  const outer = init?.signal;
  if (outer) { if (outer.aborted) ctrl.abort(); else outer.addEventListener('abort', () => ctrl.abort(), { once: true }); }
  const t = setTimeout(() => ctrl.abort(), READ_TIMEOUT_MS);
  return fetch(input, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(t));
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