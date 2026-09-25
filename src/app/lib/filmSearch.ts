// Shared search core for /search (SearchOverlay.tsx) and
// /search/category/all + /search/category/:tab (CategoryResults.tsx).
//
// These two surfaces used to run two independently-written queries for the
// same search term -- SearchOverlay expanded a query into multiple terms
// (the raw phrase + up to 3 single-word alias/synonym expansions) and
// searched each one separately across text fields AND the tags/
// secondary_roles/skills/gear array fields, while CategoryResults ran one
// simpler single-pass query. Two implementations of "what matches this
// search" inevitably disagree -- a listing visible in /search could
// silently vanish from /search/category/all's version of the same search.
// Everything here is moved verbatim out of SearchOverlay.tsx so both pages
// call the exact same functions and can never diverge again. SearchOverlay
// still owns anything that's presentation-layer only (price/sort filters,
// tier-based Opportunity/Emergency capping, suggestion typeahead) -- this
// module is only the "what actually matches the query" layer underneath
// that.
import { supabase } from '../../lib/supabase';
import { withModerationFilter, LISTING_COLUMNS, postsApi } from './api';
import { expandQuery, normalize, scoreResult } from './searchUtils';
import type { Post } from '../types';

// Full listing row shape, not just the text fields matching needs -- a
// listing's Opportunity details (paid/deadline/roleNeeded/etc.) live inside
// its `metadata` JSON column, read out by api.ts's mapListingRow(). This
// module's results feed CategoryResults.tsx's full result cards as well as
// SearchOverlay's lighter preview cards, so it selects everything
// mapListingRow needs rather than a preview-sized subset -- the extra
// columns cost nothing to a caller that ignores them.
export interface SearchListingRow {
  id: string; user_id?: string; title: string; description: string | null; price: number;
  city: string | null; province?: string | null; images: string[] | null;
  listing_type: string; listing_mode: string | null; service_category?: string | null;
  tags?: string[] | null;
  created_at?: string | null;
  is_active?: boolean | null;
  is_emergency?: boolean | null;
  emergency_expires_at?: string | null;
  videos?: string[] | null;
  contact_methods?: unknown;
  pricing_packages?: unknown;
  metadata?: unknown;
  boosted?: boolean | null;
  emergency_plan?: string | null;
}

// secondary_roles/skills/account_type are pulled in alongside the original
// preview-sized field set so CategoryResults.tsx's creators filter panel
// (role/skills/account level) can filter this same shared result set
// client-side, without a second query. available_for_hire was tried here
// too but isn't a real column on `profiles` (no migration ever created
// it -- it only ever existed as a dormant, never-actually-selected field on
// SearchOverlay.tsx's own filter type) -- selecting a nonexistent column
// fails PostgREST's ENTIRE select, not just that field, which is what took
// creators search down completely. Don't add it back without a migration.
export interface SearchProfileRow {
  id: string; name: string; username: string | null; avatar_url: string | null;
  city: string | null; location: string | null; primary_role: string | null;
  bio: string | null; is_verified: boolean | null;
  secondary_roles?: string[] | null;
  skills?: string[] | null;
  account_type?: string | null;
}

const LISTING_SELECT = LISTING_COLUMNS;
const PROFILE_SELECT = 'id, name, username, avatar_url, city, location, primary_role, bio, is_verified, secondary_roles, skills, account_type';

// Portfolio Works/Albums and Posts -- previously not searchable at all (no
// function existed; buildPortfolioFilters() in searchUtils.ts was dead
// code with zero callers). Same "one search, two presentations" shape as
// listings/profiles above so SearchOverlay and CategoryResults can never
// disagree here either.
export interface SearchPortfolioRow {
  id: string; type: 'item' | 'album'; user_id: string; title: string;
  description: string | null; category?: string | null;
  media_url?: string | null; thumbnail_url?: string | null; cover_url?: string | null;
  visibility?: string | null; created_at?: string | null;
}
export interface SearchPostRow {
  id: string; author_id: string; content: string | null;
  media_urls?: string[] | null; visibility?: string | null; created_at?: string | null;
}
const PORTFOLIO_ITEM_SELECT = 'id, user_id, title, description, category, media_url, thumbnail_url, visibility, created_at';
const PORTFOLIO_ALBUM_SELECT = 'id, user_id, title, description, category, cover_url, visibility, created_at';
const POST_SELECT = 'id, author_id, content, media_urls, visibility, created_at';
const PORTFOLIO_LIMIT = 200;
const POST_LIMIT = 200;

function safe(s: string) { return s.replace(/[%_\\]/g, ''); }

// ── Category classification ──────────────────────────────────────────────────
// The ONE place that decides which bucket a listing belongs to -- shared so
// /search and /search/category/all can never disagree about what counts as
// a Rental vs. a Service, etc. Studios aren't a separate listing_type the
// data model tracks on their own (a studio is just a listing whose title/
// category mentions "studio"); Opportunities are: listing_type = 'opportunity'.
export const isOpportunityListing = (l: SearchListingRow) => l.listing_type === 'opportunity';
export const isStudioListing = (l: SearchListingRow) =>
  /studio/i.test(l.title ?? '') || /studio/i.test(l.service_category ?? '');
export const isRentalListing = (l: SearchListingRow) =>
  l.listing_mode === 'rent' && l.listing_type !== 'service' && !isOpportunityListing(l);
export const isSaleListing = (l: SearchListingRow) => l.listing_mode === 'sale' && !isOpportunityListing(l);
export const isServiceListing = (l: SearchListingRow) => l.listing_type === 'service' && !isOpportunityListing(l);

// Terms actually searched for: the raw (normalized) phrase, plus up to 3
// single-word alias/synonym expansions (expandQuery already splits a
// multi-word query into its component words too, so "vancouver
// photographer" searches "vancouver photographer", "vancouver", and
// "photographer" -- not just the literal compound phrase, which almost
// never appears verbatim in any listing's fields).
export function expandSearchTerms(rawQ: string): string[] {
  const q = rawQ.trim();
  if (!q) return [];
  const needle = safe(normalize(q));
  if (!needle) return [];
  const aliasTerms = Array.from(new Set(
    expandQuery(rawQ)
      .filter(t => !t.includes(' ') && t.length >= 2)
      .map(t => safe(normalize(t)))
      .filter(t => t && t !== needle)
  )).slice(0, 3);
  return [needle, ...aliasTerms];
}

// Per-term fetch caps -- these used to be tuned for SearchOverlay's own
// preview modal (a handful of top matches is all it ever rendered), but
// they are now also the ONLY source /search/category/:tab and /all draw
// from, including their "uncapped"/infinite-scroll pagination -- slicing a
// pre-truncated in-memory array can never surface more than what was
// fetched here, no matter how far the caller scrolls. 20/10/15/10 was too
// small for that job (a category with more real matches than the cap
// simply could never show the rest) -- raised well above any realistic
// per-term match count for this app's current scale while still bounding
// the query for a truly generic single-letter term.
const LISTING_TEXT_LIMIT = 300;
const LISTING_TAG_LIMIT = 150;
const PROFILE_TEXT_LIMIT = 300;
const PROFILE_ARRAY_LIMIT = 150;

// Every expanded term used to fire its OWN pair of requests (Promise.all
// across terms in searchMatchingListings/searchMatchingCreators below), so
// a 4-term expansion meant up to 16 separate HTTP round trips to Supabase
// for one search (4 terms x 2 queries x listings-and-profiles). Each
// individual query got faster once the trigram/GIN indexes were added, but
// round-trip COUNT itself is still real latency (connection/TLS overhead
// per request, and up to 16 simultaneous requests can queue behind a
// browser's or Supabase's own connection limits rather than all genuinely
// running in parallel) -- that overhead didn't go away just because each
// query got cheaper. Folding every term into ONE `.or()` clause per query
// turns this into exactly 4 requests total (text + tags for listings, text
// + array for profiles), regardless of how many terms expandSearchTerms
// produced. Postgres evaluates the combined OR as a bitmap-OR across the
// same per-field indexes it would have used per term anyway, so this loses
// no matching power -- it just stops paying for it once per term.
async function searchListingsByTerms(terms: string[]): Promise<SearchListingRow[]> {
  const [textRes, tagRes] = await Promise.all([
    withModerationFilter((filterActive) => {
      let q = supabase.from('listings').select(LISTING_SELECT).eq('is_active', true);
      if (filterActive) q = q.eq('moderation_status', 'active');
      const clauses = terms.flatMap(term => [
        `title.ilike.%${term}%`,
        `description.ilike.%${term}%`,
        `service_category.ilike.%${term}%`,
        `city.ilike.%${term}%`,
      ]);
      return q.or(clauses.join(',')).limit(LISTING_TEXT_LIMIT);
    }),
    // tags is a json/jsonb column (not a Postgres text[] array) -- needs a
    // JSON array literal for the `cs` (contains) filter, not the `{...}`
    // syntax that applies to a real array column (see profiles below).
    withModerationFilter((filterActive) => {
      let q = supabase.from('listings').select(LISTING_SELECT).eq('is_active', true);
      if (filterActive) q = q.eq('moderation_status', 'active');
      const clauses = terms.map(term => `tags.cs.["${term}"]`);
      return q.or(clauses.join(',')).limit(LISTING_TAG_LIMIT);
    }),
  ]);
  if (textRes.error) console.error('[filmSearch] listings text error:', textRes.error.message);
  if (tagRes.error) console.warn('[filmSearch] listings tags error:', tagRes.error.message);

  const seen = new Set<string>();
  const combined: SearchListingRow[] = [];
  for (const row of [...(textRes.data ?? []), ...(tagRes.data ?? [])]) {
    if (row?.id && !seen.has(row.id)) { seen.add(row.id); combined.push(row as unknown as SearchListingRow); }
  }
  return combined;
}

async function searchProfilesByTerms(terms: string[]): Promise<SearchProfileRow[]> {
  const [res, arrayRes] = await Promise.all([
    supabase
      .from('profiles')
      .select(PROFILE_SELECT)
      .or(terms.flatMap(term => [
        `name.ilike.%${term}%`,
        `username.ilike.%${term}%`,
        `primary_role.ilike.%${term}%`,
        `bio.ilike.%${term}%`,
        `city.ilike.%${term}%`,
      ]).join(','))
      .not('name', 'is', null)
      .neq('name', '')
      .limit(PROFILE_TEXT_LIMIT),
    // secondary_roles/skills/gear are native Postgres arrays on the live
    // database (confirmed via a live "malformed array literal" error when
    // this briefly used the jsonb `[...]` form instead -- see git history),
    // not the jsonb the 20240124000000 migration file claims. `cs` only
    // matches a whole element exactly, not a substring, so this is a
    // best-effort supplement to the ilike fields above, same limitation
    // the listings tags search accepts.
    supabase
      .from('profiles')
      .select(PROFILE_SELECT)
      .or(terms.flatMap(term => [
        `secondary_roles.cs.{"${term}"}`,
        `skills.cs.{"${term}"}`,
        `gear.cs.{"${term}"}`,
      ]).join(','))
      .not('name', 'is', null)
      .neq('name', '')
      .limit(PROFILE_ARRAY_LIMIT),
  ]);
  if (res.error) console.error('[filmSearch] profiles error:', res.error.message);
  if (arrayRes.error) console.warn('[filmSearch] profiles array error:', arrayRes.error.message);

  const seen = new Set<string>();
  const combined: SearchProfileRow[] = [];
  for (const row of [...(res.data ?? []), ...(arrayRes.data ?? [])]) {
    if (row?.id && !seen.has(row.id)) { seen.add(row.id); combined.push(row as SearchProfileRow); }
  }
  return combined;
}

// ── Public API ────────────────────────────────────────────────────────────────
// Both return the FULL matching set (deduped across term batches, sorted by
// relevance) -- no category slicing, no result-count limiting beyond what
// each per-term query itself caps at. Callers (SearchOverlay for the /search
// preview, CategoryResults for /search/category/all and the dedicated
// per-category pages) are responsible for classifying into categories and
// slicing for display -- the query itself never changes based on who's
// asking, which is the actual fix: one search, two presentations.
export async function searchMatchingListings(rawQuery: string): Promise<SearchListingRow[]> {
  const terms = expandSearchTerms(rawQuery);
  if (!terms.length) return [];
  const listings = await searchListingsByTerms(terms);
  listings.sort((a, b) =>
    scoreResult(rawQuery, b.title, b.description ?? '', b.city ?? '') -
    scoreResult(rawQuery, a.title, a.description ?? '', a.city ?? ''));
  return listings;
}

// Opportunity/Job/Work intent (detectOpportunityIntent in searchUtils.ts)
// means "show me Opportunity listings", not "find listings whose title
// literally contains the word job/work" -- searchMatchingListings above
// requires a text match on every result, which is exactly wrong here: a
// listing titled "Looking for a Cinematographer" is a real Opportunity
// that would never match a literal "jobs" search. This filters by
// listing_type='opportunity' directly (every eligible Opportunity,
// regardless of title) and only ADDS text relevance on top when a
// remainder term exists (e.g. "cinematographer" from "cinematographer
// jobs") -- an empty remainder returns every current Opportunity,
// newest first.
export async function searchOpportunityListings(remainder: string): Promise<SearchListingRow[]> {
  const terms = remainder.trim() ? expandSearchTerms(remainder) : [];
  const res = await withModerationFilter((filterActive) => {
    let q = supabase.from('listings').select(LISTING_SELECT).eq('is_active', true).eq('listing_type', 'opportunity');
    if (filterActive) q = q.eq('moderation_status', 'active');
    if (terms.length) {
      const clauses = terms.flatMap(term => [
        `title.ilike.%${term}%`, `description.ilike.%${term}%`,
        `service_category.ilike.%${term}%`, `city.ilike.%${term}%`,
      ]);
      q = q.or(clauses.join(','));
    }
    return q.order('created_at', { ascending: false }).limit(LISTING_TEXT_LIMIT);
  });
  if (res.error) console.error('[filmSearch] opportunity listings error:', res.error.message);
  const listings = (res.data ?? []) as unknown as SearchListingRow[];
  if (terms.length) {
    listings.sort((a, b) =>
      scoreResult(remainder, b.title, b.description ?? '', b.city ?? '') -
      scoreResult(remainder, a.title, a.description ?? '', a.city ?? ''));
  }
  return listings;
}

export async function searchMatchingCreators(rawQuery: string): Promise<SearchProfileRow[]> {
  const terms = expandSearchTerms(rawQuery);
  if (!terms.length) return [];
  const users = await searchProfilesByTerms(terms);
  users.sort((a, b) =>
    scoreResult(rawQuery, b.name, b.primary_role ?? '', b.bio ?? '') -
    scoreResult(rawQuery, a.name, a.primary_role ?? '', a.bio ?? ''));
  return users;
}

async function searchPortfolioByTerms(terms: string[]): Promise<SearchPortfolioRow[]> {
  const clauses = terms.flatMap(t => [`title.ilike.%${t}%`, `description.ilike.%${t}%`, `category.ilike.%${t}%`]).join(',');
  const [itemsRes, albumsRes] = await Promise.all([
    supabase.from('portfolio_items').select(PORTFOLIO_ITEM_SELECT).or(clauses).limit(PORTFOLIO_LIMIT),
    supabase.from('portfolio_albums').select(PORTFOLIO_ALBUM_SELECT).or(clauses).limit(PORTFOLIO_LIMIT),
  ]);
  if (itemsRes.error) console.error('[filmSearch] portfolio items error:', itemsRes.error.message);
  if (albumsRes.error) console.error('[filmSearch] portfolio albums error:', albumsRes.error.message);

  // Discovery surface, not a personalized/gated feed -- only publicly
  // visible rows, same convention as getHashtagContent/getLocationContent.
  // A row with no visibility set at all is NOT excluded (matches the
  // schema's own column default).
  const items: SearchPortfolioRow[] = (itemsRes.data ?? [])
    .filter((r: any) => !r.visibility || r.visibility === 'public')
    .map((r: any) => ({ ...r, type: 'item' as const }));
  const albums: SearchPortfolioRow[] = (albumsRes.data ?? [])
    .filter((r: any) => !r.visibility || r.visibility === 'public')
    .map((r: any) => ({ ...r, type: 'album' as const }));
  return [...items, ...albums];
}

export async function searchMatchingPortfolio(rawQuery: string): Promise<SearchPortfolioRow[]> {
  const terms = expandSearchTerms(rawQuery);
  if (!terms.length) return [];
  const rows = await searchPortfolioByTerms(terms);
  rows.sort((a, b) =>
    scoreResult(rawQuery, b.title, b.description ?? '', b.category ?? '') -
    scoreResult(rawQuery, a.title, a.description ?? '', a.category ?? ''));
  return rows;
}

async function searchPostsByTerms(terms: string[]): Promise<SearchPostRow[]> {
  const { data, error } = await supabase.from('posts').select(POST_SELECT)
    .eq('visibility', 'public')
    .or(terms.map(t => `content.ilike.%${t}%`).join(','))
    .order('created_at', { ascending: false })
    .limit(POST_LIMIT);
  if (error) console.error('[filmSearch] posts error:', error.message);
  return (data ?? []) as SearchPostRow[];
}

export async function searchMatchingPosts(rawQuery: string): Promise<SearchPostRow[]> {
  const terms = expandSearchTerms(rawQuery);
  if (!terms.length) return [];
  const rows = await searchPostsByTerms(terms);
  rows.sort((a, b) =>
    scoreResult(rawQuery, b.content ?? '', '', '') -
    scoreResult(rawQuery, a.content ?? '', '', ''));
  return rows;
}

/** Same match set as searchMatchingPosts, hydrated into full Post objects
 *  (likes/comments/author/media/etc.) so search results can render through
 *  the exact same universal PostCard Home uses instead of a lighter
 *  search-specific summary row -- per spec, search decides WHAT to show,
 *  the original feature decides HOW. postsApi.getByIds doesn't preserve
 *  input order, so results are re-sorted back into the relevance order
 *  searchMatchingPosts already computed. */
export async function searchAndHydratePosts(rawQuery: string, limit?: number): Promise<Post[]> {
  const rows = await searchMatchingPosts(rawQuery);
  const ordered = limit ? rows.slice(0, limit) : rows;
  if (!ordered.length) return [];
  const posts = await postsApi.getByIds(ordered.map(r => r.id));
  const byId = new Map(posts.map(p => [p.id, p]));
  return ordered.map(r => byId.get(r.id)).filter((p): p is Post => !!p);
}
