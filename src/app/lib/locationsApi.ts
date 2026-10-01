// FILMONS Locations discovery -- same generic cross-content-type
// architecture as hashtagsApi.ts, but built on top of the REAL, already
// pre-existing `locations` table (id, name, city, province, postal_code,
// country, lat, lng, uses, created_at) that locationApi.ts's Nominatim
// geocoding flow already populates -- NOT a separate normalized-key
// scheme. See supabase/migrations/20240520000000_locations.sql for how
// this was discovered/reconciled (same class of bug as the hashtags
// migration having never been applied against the real schema).
//
// Content's free-text location field is always "City, Province" (see
// SmartAddressInput's mode="city"), so matching/creating a `locations` row
// by its `city` column (case-insensitive) is the right join key -- no new
// column needed. Matching is city+province together (not city alone) --
// two different real cities sharing a name (e.g. "Vancouver, WA" vs
// "Vancouver, BC") must never collide into the same entity.
import { supabase } from '../../lib/supabase';

export function normalizeLocationKey(input: string): string {
  return input.trim().split(',')[0].trim().toLowerCase();
}

/** Splits "City, Province" into its parts -- the format every free-text
 *  location field in this app already uses (SmartAddressInput's
 *  mode="city"). Province is null when the text has no comma. */
export function parseLocationFreeText(text: string): { city: string; province: string | null } {
  const [city, province] = text.split(',').map(s => s.trim());
  return { city: city ?? '', province: province || null };
}

function slugifyPart(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** The ONE place a location route param (/search/locations/:slug) gets
 *  built -- province-qualified whenever known, so two different real
 *  cities sharing a name never collide. Falls back to city-only when no
 *  province is known (never block on a missing province). */
export function buildLocationSlug(city: string, province?: string | null): string {
  const c = slugifyPart(city || '');
  const p = province ? slugifyPart(province) : '';
  return p ? `${c}-${p}` : c;
}

export type LocationContentType = 'post' | 'portfolio_item' | 'portfolio_album' | 'listing';

/** Call after creating/editing any content with a free-text location field.
 *  A content item has at most one location -- pass `undefined`/empty to
 *  clear it (e.g. edited to remove the location entirely). Never blocks
 *  the actual content save on failure. */
export async function indexContentLocation(contentType: LocationContentType, contentId: string, locationText: string | null | undefined): Promise<void> {
  try {
    // Always clear this content's existing location mention first -- an
    // edit from Vancouver -> Toronto (or to no location at all) must not
    // leave the stale Vancouver association around.
    await supabase.from('location_mentions').delete().eq('content_type', contentType).eq('content_id', contentId);
    const text = (locationText ?? '').trim();
    if (!text) return;
    const { city, province } = parseLocationFreeText(text);
    if (!city) return;

    // Match by city AND province together (see file header) -- fetch
    // every row whose city matches case-insensitively, then pick the one
    // whose province (if any) matches too.
    const { data: candidates } = await supabase.from('locations').select('id, province').ilike('city', city);
    let locId = (candidates ?? []).find(r => (r.province ?? null) === province)?.id;
    if (!locId) {
      const { data: created } = await supabase.from('locations')
        .insert({ name: text, city, province, country: 'Canada' })
        .select('id').maybeSingle();
      locId = created?.id;
    }
    if (!locId) return;

    await supabase.from('location_mentions').upsert(
      { location_id: locId, content_type: contentType, content_id: contentId },
      { onConflict: 'content_type,content_id', ignoreDuplicates: true },
    );
  } catch (e) {
    console.warn('[locationsApi] indexContentLocation failed:', e);
  }
}

export interface LocationSuggestion {
  key: string;
  displayName: string;
  mentionCount: number;
}

interface LocationRow { id: string; city: string | null; province: string | null; name: string | null; uses: number }

function toSuggestion(row: LocationRow): LocationSuggestion {
  const city = row.city ?? '';
  return {
    key: buildLocationSlug(city, row.province),
    displayName: row.name || (row.province ? `${city}, ${row.province}` : city),
    mentionCount: row.uses,
  };
}

/** Resolves a `/search/locations/:slug` param (province-qualified, e.g.
 *  "surrey-bc") -- or a legacy bare-city key ("surrey") from an old
 *  redirected link -- back to its real `locations` row. Never splits the
 *  slug itself on '-' to recover city/province (city names can contain
 *  dashes) -- instead regenerates each candidate's slug and compares. */
async function resolveLocationRow(slugInput: string): Promise<LocationRow | null> {
  const cityGuess = normalizeLocationKey(slugInput).split('-')[0];
  if (!cityGuess) return null;
  const { data } = await supabase.from('locations').select('id, city, province, name, uses')
    .ilike('city', `${cityGuess}%`).limit(50);
  const rows = (data ?? []) as LocationRow[];
  const exact = rows.find(r => buildLocationSlug(r.city ?? '', r.province) === slugInput);
  if (exact) return exact;
  // Legacy fallback: an old bare-city key with no province segment at all.
  return rows.find(r => (r.city ?? '').toLowerCase() === normalizeLocationKey(slugInput)) ?? null;
}

/** Ranking: exact match, then startsWith, then contains, ordered by usage/
 *  recency within each tier -- same convention as searchHashtagSuggestions. */
export async function searchLocationSuggestions(query: string, limit = 10): Promise<LocationSuggestion[]> {
  const q = normalizeLocationKey(query);
  if (!q) return [];
  const { data, error } = await supabase.from('locations').select('city, province, name, uses')
    .ilike('city', `%${q}%`)
    .order('uses', { ascending: false })
    .limit(50);
  if (error || !data?.length) return [];

  const tier = (city: string) => city.toLowerCase() === q ? 0 : city.toLowerCase().startsWith(q) ? 1 : 2;
  const ranked = [...data].sort((a: any, b: any) => tier(a.city ?? '') - tier(b.city ?? '') || b.uses - a.uses);
  return ranked.slice(0, limit).map((l: any) => toSuggestion(l));
}

export async function getLocation(keyInput: string): Promise<LocationSuggestion | null> {
  const row = await resolveLocationRow(keyInput);
  return row ? toSuggestion(row) : null;
}

export interface LocationPost {
  id: string; authorId: string; authorName: string; authorAvatar: string | null; authorVerified: boolean;
  content: string; thumbnailUrl: string | null; createdAt: string;
}
export interface LocationPortfolioEntry {
  id: string; type: 'item' | 'album'; creatorId: string; creatorName: string; creatorAvatar: string | null;
  title: string; thumbnailUrl: string | null;
}
export interface LocationListing {
  id: string; title: string; price: number; image: string | null; city: string;
}

export interface LocationContent {
  posts: LocationPost[];
  portfolio: LocationPortfolioEntry[];
  listings: LocationListing[];
}

/** Location results page content -- posts/Portfolio items+albums/listings,
 *  visibility-respecting (same pattern as getHashtagContent). */
export async function getLocationContent(keyInput: string, limit = 30): Promise<LocationContent> {
  const locRow = await resolveLocationRow(keyInput);
  if (!locRow) return { posts: [], portfolio: [], listings: [] };

  const { data: mentions } = await supabase.from('location_mentions')
    .select('content_type, content_id, created_at')
    .eq('location_id', locRow.id)
    .order('created_at', { ascending: false })
    .limit(200);
  const rows = mentions ?? [];
  const idsFor = (type: LocationContentType) => rows.filter(r => r.content_type === type).map(r => r.content_id);

  const [posts, items, albums, listings] = await Promise.all([
    fetchLocationPosts(idsFor('post'), limit),
    fetchLocationPortfolioItems(idsFor('portfolio_item'), limit),
    fetchLocationPortfolioAlbums(idsFor('portfolio_album'), limit),
    fetchLocationListings(idsFor('listing'), limit),
  ]);

  return { posts, portfolio: [...items, ...albums], listings };
}

async function fetchLocationPosts(ids: string[], limit: number): Promise<LocationPost[]> {
  if (!ids.length) return [];
  const { data } = await supabase.from('posts')
    .select('id, author_id, content, media_urls, visibility, created_at')
    .in('id', ids).eq('visibility', 'public')
    .order('created_at', { ascending: false }).limit(limit);
  const rows = data ?? [];
  if (!rows.length) return [];
  const authorIds = [...new Set(rows.map((r: any) => r.author_id))];
  const { data: profiles } = await supabase.from('profiles').select('id, name, avatar_url, is_verified').in('id', authorIds);
  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
  return rows.map((r: any) => {
    const p = profileMap.get(r.author_id);
    const media = Array.isArray(r.media_urls) ? r.media_urls : [];
    return {
      id: r.id, authorId: r.author_id, authorName: p?.name ?? 'Filmons user', authorAvatar: p?.avatar_url ?? null,
      authorVerified: !!p?.is_verified, content: r.content ?? '', thumbnailUrl: media[0] ?? null, createdAt: r.created_at,
    };
  });
}

async function fetchLocationPortfolioItems(ids: string[], limit: number): Promise<LocationPortfolioEntry[]> {
  if (!ids.length) return [];
  const { data } = await supabase.from('portfolio_items')
    .select('id, user_id, title, media_url, thumbnail_url, visibility, created_at')
    .in('id', ids).order('created_at', { ascending: false }).limit(limit);
  const rows = (data ?? []).filter((r: any) => !r.visibility || r.visibility === 'public');
  return attachCreatorsToPortfolioRows(rows, 'item');
}

async function fetchLocationPortfolioAlbums(ids: string[], limit: number): Promise<LocationPortfolioEntry[]> {
  if (!ids.length) return [];
  const { data } = await supabase.from('portfolio_albums')
    .select('id, user_id, title, cover_url, visibility, created_at')
    .in('id', ids).order('created_at', { ascending: false }).limit(limit);
  const rows = (data ?? []).filter((r: any) => !r.visibility || r.visibility === 'public');
  return attachCreatorsToPortfolioRows(rows, 'album');
}

async function attachCreatorsToPortfolioRows(rows: any[], type: 'item' | 'album'): Promise<LocationPortfolioEntry[]> {
  if (!rows.length) return [];
  const userIds = [...new Set(rows.map(r => r.user_id))];
  const { data: profiles } = await supabase.from('profiles').select('id, name, avatar_url').in('id', userIds);
  const map = new Map((profiles ?? []).map((p: any) => [p.id, p]));
  return rows.map(r => {
    const p = map.get(r.user_id);
    return {
      id: r.id, type, creatorId: r.user_id, creatorName: p?.name ?? 'Filmons user', creatorAvatar: p?.avatar_url ?? null,
      title: r.title, thumbnailUrl: r.thumbnail_url || r.media_url || r.cover_url || null,
    };
  });
}

async function fetchLocationListings(ids: string[], limit: number): Promise<LocationListing[]> {
  if (!ids.length) return [];
  const { data } = await supabase.from('listings')
    .select('id, title, price, images, city, is_active')
    .in('id', ids).eq('is_active', true)
    .limit(limit);
  return (data ?? []).map((r: any) => ({
    id: r.id, title: r.title, price: Number(r.price) || 0,
    image: Array.isArray(r.images) ? r.images[0] ?? null : null, city: r.city ?? '',
  }));
}
