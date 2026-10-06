# FILMONS — rules for every session

## Loading rule (applies to every page, now and in future)

**No page, section or action may leave the user waiting more than 5 seconds.**
Whenever you create or change a page that loads data:

1. **Show something immediately** — a skeleton shaped like the real layout, or
   cached data from the last visit (stale-while-revalidate). Never a blank
   screen.
2. **Parallelise.** Independent requests go in one `Promise.all`; don't chain
   `await`s that don't depend on each other.
3. **Give every secondary request a deadline.** Wrap non-essential lookups
   (badges, counts, recommendations, enrichment) with `withTimeout(promise, ms,
   fallback)` from `src/app/lib/withTimeout.ts` (≈2.5–3.5s) so one slow query
   can't hold the page; the page renders with the fallback.
4. **Page-level loading uses the standard pieces**, which enforce the 5s rule
   for you:
   - `<PageLoadState loading error onRetry skeleton>` (`src/app/components/PageLoadState.tsx`), or
   - `FilmonsBrandLoader` with `size` `md`/`lg` or `fullscreen`, or
   - `useLoadDeadline(loading)` (`src/app/lib/useLoadDeadline.ts`) if you build your own.
   After 5s they switch to "This is taking longer than expected" + **Retry**.
   Never ship a bare spinner with no timeout/retry.
5. **Errors are visible and retryable** — never swallow a failed load into an
   empty state that looks like "no results".
6. **Paginate** lists (≈20–30 rows per request) and select only needed columns.

Safety net (don't rely on it): `src/lib/supabase.ts` aborts every Supabase
read (GET/HEAD to `/rest/v1/`) after 4.5s outside the admin app. Writes,
storage uploads and edge functions are not auto-aborted — give long ones their
own progress UI.

## Releasing
Only merge to `main` / "push live" when the user asks.
