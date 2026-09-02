// One-shot handoff for SearchOverlay's own state (query, active category,
// filters, sort, scroll position) across a navigation to a listing's
// detail page and back -- same sessionStorage one-shot pattern as
// authReturnUrl.ts. Saved right before navigating to a listing FROM
// search, consumed (read + cleared) once on SearchOverlay's next mount,
// so a later fresh visit to /search never restores stale state.
const KEY = 'filmons_search_state';

export interface PersistedSearchState {
  q: string;
  activeTab: string;
  filters: unknown;
  sort: string;
  scrollY: number;
}

export function saveSearchState(state: PersistedSearchState) {
  try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch {}
}

export function consumeSearchState(): PersistedSearchState | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
