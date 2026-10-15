// After a new deploy, a tab that is still running the OLD app asks for page chunks whose files no longer exist; the
// host answers with index.html, and the browser reports "text/html is not a valid JavaScript MIME type" (or
// "Failed to fetch dynamically imported module"). Reloading once fetches the new app and fixes it.
const KEY = 'filmons:chunk-reload-at';

export function isChunkLoadError(e: unknown): boolean {
  const msg = String((e as any)?.message ?? e ?? '');
  return /not a valid JavaScript MIME type|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(msg);
}

/** Reloads the page once (never in a loop). Returns true when a reload was started. */
export function reloadOnceForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < 60_000) return false;      // already tried a moment ago: let the error show instead
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch { /* storage blocked: still try once */ }
  window.location.reload();
  return true;
}

export function installChunkRecovery() {
  // Vite fires this when a preloaded chunk (module or CSS) fails to load.
  window.addEventListener('vite:preloadError', (e) => { if (reloadOnceForNewVersion()) e.preventDefault(); });
  window.addEventListener('unhandledrejection', (e) => { if (isChunkLoadError(e.reason)) reloadOnceForNewVersion(); });
}
