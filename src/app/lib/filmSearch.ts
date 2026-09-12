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
import { withModerationFilter, LISTING_COLUMNS } from './api';
import { expandQuery, normalize, scoreResult } from './searchUtils';

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

async function searchListingsByTerm(term: string): Promise<SearchListingRow[]> {
  const textRes = await withModerationFilter((filterActive) => {
    let q = supabase.from('listings').select(LISTING_SELECT).eq('is_active', true);
    if (filterActive) q = q.eq('moderation_status', 'active');
    return q
      .or([
        `title.ilike.%${term}%`,
        `description.ilike.%${term}%`,
        `service_category.ilike.%${term}%`,
        `city.ilike.%${term}%`,
      ].join(','))
      .limit(LISTING_TEXT_LIMIT);
  });
  if (textRes.error) console.error(`[filmSearch] listings text error (term="${term}"):`, textRes.error.message);

  // tags is a json/jsonb column (not a Postgres text[] array) -- needs a
  // JSON array literal for the `cs` (contains) filter, not the `{...}`
  // syntax that applies to a real array column (see profiles below).
  const tagRes = await withModerationFilter((filterActive) => {
    let q = supabase.from('listings').select(LISTING_SELECT).eq('is_active', true);
    if (filterActive) q = q.eq('moderation_status', 'active');
    return q.filter('tags', 'cs', `["${term}"]`).limit(LISTING_TAG_LIMIT);
  });
  if (tagRes.error) console.warn(`[filmSearch] listings tags error (term="${term}"):`, tagRes.error.message);

  const seen = new Set<string>();
  const combined: SearchListingRow[] = [];
  for (const row of [...(textRes.data ?? []), ...(tagRes.data ?? [])]) {
    if (row?.id && !seen.has(row.id)) { seen.add(row.id); combined.push(row as unknown as SearchListingRow); }
  }
  return combined;
}

async function searchProfilesByTerm(term: string): Promise<SearchProfileRow[]> {
  const res = await supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .or([
      `name.ilike.%${term}%`,
      `username.ilike.%${term}%`,
      `primary_role.ilike.%${term}%`,
      `bio.ilike.%${term}%`,
      `city.ilike.%${term}%`,
    ].join(','))
    .not('name', 'is', null)
    .neq('name', '')
    .limit(PROFILE_TEXT_LIMIT);
  if (res.error) console.error(`[filmSearch] profiles error (term="${term}"):`, res.error.message);

  // secondary_roles/skills/gear are real Postgres text[] arrays (not
  // jsonb) -- need the `{...}` array-literal form for `cs`, the opposite
  // of listings.tags above. `cs` only matches a whole element exactly,
  // not a substring, so this is a best-effort supplement to the ilike
  // fields above, same limitation the listings tags search accepts.
  const arrayRes = await supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .or([
      `secondary_roles.cs.{"${term}"}`,
      `skills.cs.{"${term}"}`,
      `gear.cs.{"${term}"}`,
    ].join(','))
    .not('name', 'is', null)
    .neq('name', '')
    .limit(PROFILE_ARRAY_LIMIT);
  if (arrayRes.error) console.warn(`[filmSearch] profiles array error (term="${term}"):`, arrayRes.error.message);

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
  const batches = await Promise.all(terms.map(searchListingsByTerm));
  const seen = new Set<string>();
  const listings: SearchListingRow[] = [];
  for (const batch of batches) for (const l of batch) if (!seen.has(l.id)) { seen.add(l.id); listings.push(l); }
  listings.sort((a, b) =>
    scoreResult(rawQuery, b.title, b.description ?? '', b.city ?? '') -
    scoreResult(rawQuery, a.title, a.description ?? '', a.city ?? ''));
  return listings;
}

export async function searchMatchingCreators(rawQuery: string): Promise<SearchProfileRow[]> {
  const terms = expandSearchTerms(rawQuery);
  if (!terms.length) return [];
  const batches = await Promise.all(terms.map(searchProfilesByTerm));
  const seen = new Set<string>();
  const users: SearchProfileRow[] = [];
  for (const batch of batches) for (const u of batch) if (!seen.has(u.id)) { seen.add(u.id); users.push(u); }
  users.sort((a, b) =>
    scoreResult(rawQuery, b.name, b.primary_role ?? '', b.bio ?? '') -
    scoreResult(rawQuery, a.name, a.primary_role ?? '', a.bio ?? ''));
  return users;
}
