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

const PROVINCE_CODES: Record<string, string> = {
  'alberta': 'AB', 'british columbia': 'BC', 'manitoba': 'MB', 'new brunswick': 'NB',
  'newfoundland and labrador': 'NL', 'newfoundland': 'NL', 'nova scotia': 'NS', 'northwest territories': 'NT',
  'nunavut': 'NU', 'ontario': 'ON', 'prince edward island': 'PE', 'quebec': 'QC', 'québec': 'QC',
  'saskatchewan': 'SK', 'yukon': 'YT',
};
/** "British Columbia" / "bc" -> "BC". Anything that isn't a recognisable province or state
 *  (e.g. "Metro Vancouver Regional District", a regional district a geocoder put in that
 *  slot) -> null, so it can never split one city into several locations. */
export function normalizeProvince(p: string | null | undefined): string | null {
  const v = (p ?? '').trim();
  if (!v) return null;
  const named = PROVINCE_CODES[v.toLowerCase()];
  if (named) return named;
  return /^[A-Za-z]{2}$/.test(v) ? v.toUpperCase() : null;
}

/** Splits free-text location into city + province. Handles "Surrey, BC", full geocoder
 *  strings ("Surrey, Metro Vancouver Regional District, British Columbia, Canada") and street
 *  addresses ("13450 104 Ave, Surrey, BC V3T 1V8, Canada"). Province is a 2-letter code, or
 *  null when unknown. */
export function parseLocationFreeText(text: string): { city: string; province: string | null } {
  const parts = text.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length >= 2 && /^(canada|united states( of america)?|usa|us)$/i.test(parts[parts.length - 1])) parts.pop();
  // A street address leads with the street, not the city: city/province follow it, and a
  // trailing postal code is dropped from the province ("BC V3T 1V8" -> "BC").
  if (parts.length >= 3 && /\d/.test(parts[0])) {
    return { city: parts[1], province: normalizeProvince(parts[2].split(/\s+/)[0]) };
  }
  // "City, <anything in between>, Province" -- the province is the LAST segment.
  if (parts.length >= 3) return { city: parts[0], province: normalizeProvince(parts[parts.length - 1]) };
  const [city, province] = parts;
  return { city: city ?? '', province: normalizeProvince(province) };
}

/** Same real province, treating an unknown / unrecognised one as compatible with anything. */
export function provincesCompatible(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normalizeProvince(a), y = normalizeProvince(b);
  return !x || !y || x === y;
}

function slugifyPart(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** The ONE place a location route param (/search/locations/:slug) gets
 *  built -- province-qualified whenever known, so two different real
 *  cities sharing a name never collide. Falls back to city-only when no
 *  province is known (never block on a missing province). */
/** The place a piece of work should show: its own location when it has one, otherwise the creator's
 *  city. `label` is the short city name; `slug` opens that place's page. */
export function placeFor(itemLocation: string | null | undefined, creatorCity?: string | null): { label: string; slug: string } | null {
  const own = (itemLocation ?? '').trim();
  if (own) {
    const { city, province } = parseLocationFreeText(own);
    if (city) return { label: city, slug: buildLocationSlug(city, province) };
  }
  const c = (creatorCity ?? '').trim();
  return c ? { label: c, slug: buildLocationSlug(c) } : null;
}

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
    const cands = candidates ?? [];
    let locId = cands.find(r => normalizeProvince(r.province) === province)?.id;
    if (!locId && !province && cands.length) {
      // "Surrey" with no province joins the existing "Surrey, BC" (or the only Surrey)
      // rather than becoming a second, separate location nobody lands on.
      locId = [...cands].sort((a, b) => Number(!!normalizeProvince(b.province)) - Number(!!normalizeProvince(a.province)))[0].id;
    }
    if (!locId && province) {
      // The reverse: "Surrey, BC" adopts an earlier province-less "Surrey" row.
      const bare = cands.find(r => !normalizeProvince(r.province));
      if (bare) {
        locId = bare.id;
        await supabase.from('locations').update({ province, name: `${city}, ${province}` }).eq('id', bare.id);
      }
    }
    if (!locId) {
      const { data: created } = await supabase.from('locations')
        .insert({ name: province ? `${city}, ${province}` : city, city, province, country: 'Canada' })
        .select('id').maybeSingle();
      locId = created?.id;
    }
    if (!locId) return;

    const { error: mentionErr } = await supabase.from('location_mentions').upsert(
      { location_id: locId, content_type: contentType, content_id: contentId },
      { onConflict: 'content_type,content_id', ignoreDuplicates: true },
    );
    if (mentionErr) console.warn('[locationsApi] location_mentions upsert failed:', mentionErr.message);
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
  // Short, consistent names ("Surrey, BC") -- never the raw geocoder string.
  const prov = normalizeProvince(row.province);
  return {
    key: buildLocationSlug(city, prov ?? row.province),
    displayName: prov ? `${city}, ${prov}` : city,
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
  const wanted = slugInput.trim().toLowerCase();
  const exact = rows.find(r => buildLocationSlug(r.city ?? '', r.province) === wanted)
    ?? rows.find(r => buildLocationSlug(r.city ?? '', normalizeProvince(r.province)) === wanted);
  if (exact) return exact;
  // Legacy fallback: an old bare-city key with no province segment at all. Several rows can
  // share the city (with / without province) -- prefer the most-used one.
  const sameCity = rows.filter(r => (r.city ?? '').toLowerCase() === normalizeLocationKey(slugInput));
  return sameCity.sort((a, b) => (b.uses ?? 0) - (a.uses ?? 0))[0] ?? null;
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
  // One entry per real place: rows that differ only by a stray province string collapse together.
  const seen = new Set<string>();
  const out: LocationSuggestion[] = [];
  for (const l of ranked as any[]) {
    const sug = toSuggestion(l);
    const k = sug.displayName.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(sug);
    if (out.length >= limit) break;
  }
  return out;
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
export interface LocationScope {
  /** "Surrey, BC" */
  displayName: string;
  city: string;
  province: string | null;
  /** Every `locations` row that is this place (with / without province, older saves). */
  locationIds: string[];
  /** Ids of the content tagged with this place, per content type. */
  ids: Record<LocationContentType, string[]>;
}

/** Everything a location page needs to filter content: the place and the ids tagged with it
 *  (matched by location id first, free-text location only as a safety net). */
export async function getLocationScope(keyInput: string): Promise<LocationScope | null> {
  // No `locations` row (indexing never ran/failed)? Still search by the city in the link, so
  // "Surrey" and "surrey" both work off the text saved on the posts/works themselves.
  const resolved = await resolveLocationRow(keyInput);
  const guessCity = normalizeLocationKey(keyInput).replace(/-[a-z]{2}$/i, '').replace(/-/g, ' ').trim();
  if (!resolved && !guessCity) return null;
  const locRow: LocationRow = resolved ?? { id: '', city: guessCity, province: null, name: guessCity, uses: 0 } as LocationRow;

  // Content can be indexed under any row for this city (one with a province, one without,
  // from older saves) -- show all of it on the one page the user can reach.
  const { data: sameCity } = await supabase.from('locations').select('id, province')
    .ilike('city', locRow.city ?? '');
  const locIds = (sameCity ?? [])
    .filter((r: any) => provincesCompatible(locRow.province, r.province))
    .map((r: any) => r.id);
  if (locRow.id && !locIds.includes(locRow.id)) locIds.push(locRow.id);
  const { data: mentions } = locIds.length
    ? await supabase.from('location_mentions')
        .select('content_type, content_id, created_at')
        .in('location_id', locIds)
        .order('created_at', { ascending: false })
        .limit(200)
    : { data: [] as any[] };
  const rows = mentions ?? [];
  const ids: Record<LocationContentType, Set<string>> = {
    post: new Set(), portfolio_item: new Set(), portfolio_album: new Set(), listing: new Set(),
  };
  for (const r of rows) ids[r.content_type as LocationContentType]?.add(String(r.content_id));

  // The index (location_mentions) is not the only record of where something happened:
  // posts are also linked through post_locations, and every post / work / listing keeps its
  // own free-text location. Include those too, so a place's page never misses content just
  // because indexing failed or ran under an older location row.
  const city = (locRow.city ?? '').replace(/[%_,()"]/g, '').trim();
  if (city) {
    // `.ilike()` (not a hand-built `.or()` string) so the pattern is encoded safely; the exact
    // "is this the city?" check then runs in JS on the returned text.
    const cityRe = new RegExp(`(^|[\\s,])${city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[\\s,])`, 'i');
    const withLocation = async (table: 'posts' | 'portfolio_items') => {
      const { data, error } = await supabase.from(table).select('id, location').ilike('location', `%${city}%`).limit(150);
      if (error) console.warn(`[locationsApi] ${table} location lookup failed:`, error.message);
      return (data ?? []).filter((r: any) => cityRe.test(String(r.location ?? '')));
    };
    const [legacy, textPosts, textItems, cityListings] = await Promise.all([
      locIds.length ? supabase.from('post_locations').select('post_id').in('location_id', locIds).limit(200) : Promise.resolve({ data: [] as any[] }),
      withLocation('posts'),
      withLocation('portfolio_items'),
      supabase.from('listings').select('id').ilike('city', city).eq('is_active', true).limit(300),
    ]);
    for (const r of legacy.data ?? []) ids.post.add(String((r as any).post_id));
    for (const r of textPosts) ids.post.add(String((r as any).id));
    for (const r of textItems) ids.portfolio_item.add(String((r as any).id));
    for (const r of cityListings.data ?? []) ids.listing.add(String((r as any).id));
  }
  const prov = normalizeProvince(locRow.province);
  const shownCity = locRow.city ?? guessCity;
  return {
    displayName: prov ? `${shownCity}, ${prov}` : shownCity,
    city: shownCity, province: prov, locationIds: locIds,
    ids: {
      post: [...ids.post], portfolio_item: [...ids.portfolio_item],
      portfolio_album: [...ids.portfolio_album], listing: [...ids.listing],
    },
  };
}

export async function getLocationContent(keyInput: string, limit = 30): Promise<LocationContent> {
  const scope = await getLocationScope(keyInput);
  if (!scope) return { posts: [], portfolio: [], listings: [] };
  const idsFor = (type: LocationContentType) => scope.ids[type];

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
