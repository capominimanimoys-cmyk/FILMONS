// Data layer for /search/locations/:slug -- content of ONE place, per category, filtered by the
// place first (ids tagged with its location rows -- see getLocationScope) and then by the query
// and category filters. Each category produces a ranked list of matches (relevance, then recency);
// the page shows slices of it and hydrates only the slice it renders.
import { supabase } from '../../lib/supabase';
import { LISTING_COLUMNS, mapListingRow, postsApi, withModerationFilter } from './api';
import { getCoursesByIds, type Course } from './coursesApi';
import { getPortfolioEntriesByIds, type PortfolioFeedEntry } from './portfolioApi';
import { fetchTrust, PROFILE_SELECT, toProfile, type SearchProfile } from './profileSearch';
import { normalizeProvince, provincesCompatible, type LocationScope } from './locationsApi';
import type { Listing, Post } from '../types';

export type LocationCategory = 'all' | 'marketplace' | 'posts' | 'portfolio' | 'profiles' | 'courses';
export const LOCATION_CATEGORIES: { id: LocationCategory; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'marketplace', label: 'Marketplace' }, { id: 'posts', label: 'Posts' },
  { id: 'portfolio', label: 'Portfolio' }, { id: 'profiles', label: 'Profiles' }, { id: 'courses', label: 'Courses' },
];
/** All-category order. */
export const SECTION_ORDER = ['marketplace', 'posts', 'portfolio', 'profiles', 'courses'] as const;
export type SectionCategory = typeof SECTION_ORDER[number];

export interface FilterDef { key: string; label: string; options: { value: string; label: string }[] }
export type LocationFilters = Record<string, string>;
export const CATEGORY_FILTERS: Record<SectionCategory, FilterDef[]> = {
  marketplace: [{ key: 'type', label: 'Type', options: [
    { value: 'rental', label: 'Rentals' }, { value: 'sale', label: 'For sale' },
    { value: 'service', label: 'Services' }, { value: 'opportunity', label: 'Opportunities' }] }],
  posts: [{ key: 'media', label: 'Media', options: [{ value: 'media', label: 'With photos / video' }, { value: 'text', label: 'Text only' }] }],
  portfolio: [{ key: 'type', label: 'Type', options: [{ value: 'item', label: 'Works' }, { value: 'album', label: 'Albums' }] }],
  profiles: [
    { key: 'verified', label: 'Verification', options: [{ value: '1', label: 'Verified only' }] },
    { key: 'trust', label: 'Trust Score', options: [{ value: '50', label: '50+' }, { value: '80', label: '80+' }] },
  ],
  courses: [
    { key: 'price', label: 'Price', options: [{ value: 'free', label: 'Free' }, { value: 'paid', label: 'Paid' }] },
    { key: 'level', label: 'Level', options: [
      { value: 'beginner', label: 'Beginner' }, { value: 'intermediate', label: 'Intermediate' }, { value: 'advanced', label: 'Advanced' }] },
  ],
};

export type PortfolioRef = { type: 'item' | 'album'; id: string };
export interface CategoryMatches {
  marketplace: Listing[]; posts: string[]; portfolio: PortfolioRef[]; profiles: SearchProfile[]; courses: string[];
}

/** Candidate cap per category -- bounds one search to a handful of requests. */
const CANDIDATE_CAP = 200;
const lc = (v: unknown) => String(v ?? '').toLowerCase();
const timeOf = (v: unknown) => { const t = Date.parse(String(v ?? '')); return Number.isFinite(t) ? t : 0; };

/** 0 = no match; higher = closer. Empty query matches everything with score 1. */
function relevance(query: string, primary: unknown, ...secondary: unknown[]): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const terms = q.split(/\s+/).filter(Boolean);
  const p = lc(primary);
  const rest = lc(secondary.filter(Boolean).join(' '));
  let score = 0;
  if (p.startsWith(q)) score += 100; else if (p.includes(q)) score += 70;
  else if (rest.includes(q)) score += 40;
  else if (terms.length > 1 && terms.every(t => p.includes(t) || rest.includes(t))) score += 25;
  return score;
}
const byScoreThenRecency = <T extends { score: number; at: number }>(a: T, b: T) => b.score - a.score || b.at - a.at;

async function inChunks<T>(ids: string[], run: (chunk: string[]) => PromiseLike<T[]>, size = 80): Promise<T[]> {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) chunks.push(ids.slice(i, i + size));
  return (await Promise.all(chunks.map(run))).flat();
}

function cityMatcher(city: string) {
  const esc = city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[\\s,])${esc}(?=$|[\\s,])`, 'i');
}

const listingKind = (l: Listing) =>
  l.listingType === 'opportunity' ? 'opportunity' : l.listingType === 'service' ? 'service' : l.listingMode === 'sale' ? 'sale' : 'rental';

// ── Per-category matching ───────────────────────────────────────────────────
async function matchMarketplace(scope: LocationScope, query: string, f: LocationFilters): Promise<Listing[]> {
  const ids = scope.ids.listing.slice(0, CANDIDATE_CAP);
  const rows = await inChunks(ids, async chunk => {
    const { data, error } = await withModerationFilter(active => {
      let q = supabase.from('listings').select(LISTING_COLUMNS).in('id', chunk).eq('is_active', true);
      if (active) q = q.eq('moderation_status', 'active');
      return q;
    });
    if (error) throw error;
    return data ?? [];
  });
  return rows.map(mapListingRow)
    .filter(l => !f.type || listingKind(l) === f.type)
    .map(l => ({ l, score: relevance(query, l.title, l.description, l.city, (l.tags ?? []).join(' ')), at: timeOf(l.createdAt) }))
    .filter(x => x.score > 0).sort(byScoreThenRecency).map(x => x.l);
}

async function matchPosts(scope: LocationScope, query: string, f: LocationFilters): Promise<string[]> {
  const rows = await inChunks(scope.ids.post.slice(0, CANDIDATE_CAP), async chunk => {
    const { data, error } = await supabase.from('posts').select('id, content, media_urls, created_at')
      .in('id', chunk).eq('visibility', 'public');
    if (error) throw error;
    return data ?? [];
  });
  return rows
    .filter((r: any) => {
      const hasMedia = Array.isArray(r.media_urls) && r.media_urls.length > 0;
      return !f.media || (f.media === 'media' ? hasMedia : !hasMedia);
    })
    .map((r: any) => ({ id: String(r.id), score: relevance(query, r.content), at: timeOf(r.created_at) }))
    .filter(x => x.score > 0).sort(byScoreThenRecency).map(x => x.id);
}

async function creatorWork(scope: LocationScope, wantItems: boolean, wantAlbums: boolean): Promise<[any[], any[]]> {
  const people = await profilesInPlace(scope).catch(() => [] as any[]);
  const userIds = people.map((p: any) => String(p.id));
  if (!userIds.length) return [[], []];
  const [items, albums] = await Promise.all([
    wantItems ? inChunks(userIds, async chunk => {
      const { data } = await supabase.from('portfolio_items')
        .select('id, title, description, category, visibility, location, created_at').in('user_id', chunk)
        .order('created_at', { ascending: false }).limit(100);
      return data ?? [];
    }) : Promise.resolve([] as any[]),
    wantAlbums ? inChunks(userIds, async chunk => {
      let res = await supabase.from('portfolio_albums')
        .select('id, title, description, category, visibility, location, created_at').in('user_id', chunk)
        .order('created_at', { ascending: false }).limit(100);
      if (res.error) res = await supabase.from('portfolio_albums')   // no `location` column on this database
        .select('id, title, description, category, visibility, created_at').in('user_id', chunk)
        .order('created_at', { ascending: false }).limit(100) as any;
      return res.data ?? [];
    }) : Promise.resolve([] as any[]),
  ]);
  // Work tagged with a DIFFERENT place belongs to that place, not to where its creator lives.
  const re = cityMatcher(scope.city);
  const here = (r: any) => !String(r.location ?? '').trim() || re.test(String(r.location));
  return [items.filter(here), albums.filter(here)];
}

async function matchPortfolio(scope: LocationScope, query: string, f: LocationFilters): Promise<PortfolioRef[]> {
  const wantItems = f.type !== 'album', wantAlbums = f.type !== 'item';
  const [items, albums] = await Promise.all([
    wantItems ? inChunks(scope.ids.portfolio_item.slice(0, CANDIDATE_CAP), async chunk => {
      const { data, error } = await supabase.from('portfolio_items')
        .select('id, title, description, category, visibility, created_at').in('id', chunk);
      if (error) throw error;
      return data ?? [];
    }) : Promise.resolve([] as any[]),
    wantAlbums ? inChunks(scope.ids.portfolio_album.slice(0, CANDIDATE_CAP), async chunk => {
      const { data, error } = await supabase.from('portfolio_albums')
        .select('id, title, description, category, visibility, created_at').in('id', chunk);
      if (error) throw error;
      return data ?? [];
    }) : Promise.resolve([] as any[]),
  ]);
  // The location chip on a portfolio card is the CREATOR's place, so work by people based here
  // belongs on this page too (not only work individually tagged with the place).
  const [creatorItems, creatorAlbums] = await creatorWork(scope, wantItems, wantAlbums);
  const known = new Set<string>([...items, ...albums].map((r: any) => String(r.id)));
  items.push(...creatorItems.filter((r: any) => !known.has(String(r.id))));
  albums.push(...creatorAlbums.filter((r: any) => !known.has(String(r.id))));
  const publicAlbums = albums.filter((r: any) => !r.visibility || r.visibility === 'public');
  // An album with no works in it is not a result.
  const filled = new Set<string>();
  if (publicAlbums.length) {
    const links = await inChunks(publicAlbums.map((a: any) => String(a.id)), async chunk => {
      const { data } = await supabase.from('portfolio_album_items').select('album_id').in('album_id', chunk);
      return data ?? [];
    });
    links.forEach((l: any) => filled.add(String(l.album_id)));
  }
  const rank = (r: any, type: PortfolioRef['type']) => ({
    ref: { type, id: String(r.id) } as PortfolioRef,
    score: relevance(query, r.title, r.description, r.category), at: timeOf(r.created_at),
  });
  return [
    ...items.filter((r: any) => !r.visibility || r.visibility === 'public').map((r: any) => rank(r, 'item')),
    ...publicAlbums.filter((a: any) => filled.has(String(a.id))).map((a: any) => rank(a, 'album')),
  ].filter(x => x.score > 0).sort(byScoreThenRecency).map(x => x.ref);
}

const cityProfileRows = new WeakMap<LocationScope, Promise<any[]>>();
/** Profiles whose own location is this place (city match, province must not contradict). */
function profilesInPlace(scope: LocationScope): Promise<any[]> {
  let p = cityProfileRows.get(scope);
  if (p) return p;
  const city = scope.city.replace(/[%_,()"]/g, '').trim();
  p = (async () => {
    if (!city) return [];
    const { data, error } = await supabase.from('profiles').select(PROFILE_SELECT)
      .or(`city.ilike."${city}",location.ilike."%${city}%"`)
      .not('name', 'is', null).neq('name', '').limit(CANDIDATE_CAP);
    if (error) throw error;
    const re = cityMatcher(city);
    return (data ?? []).filter((r: any) => {
      const sameCity = lc(r.city).trim() === city.toLowerCase();
      // Province must not contradict the place (profiles may hold only a city, or a district name).
      if (sameCity) return provincesCompatible(scope.province, normalizeProvince(r.province));
      return re.test(String(r.location ?? ''));
    });
  })();
  cityProfileRows.set(scope, p);
  p.catch(() => cityProfileRows.delete(scope));
  return p;
}

async function matchProfiles(scope: LocationScope, query: string, f: LocationFilters): Promise<SearchProfile[]> {
  const rows = await profilesInPlace(scope);
  const trust = await fetchTrust(rows.map((r: any) => r.id)).catch(() => new Map<string, number>());
  const minTrust = Number(f.trust) || 0;
  return rows.map((r: any) => toProfile(r, trust, query.trim() ? [query.trim().toLowerCase()] : []))
    .filter(p => (!f.verified || p.isVerified) && (!minTrust || (p.trust ?? 0) >= minTrust))
    .map(p => ({
      p, at: 0,
      score: relevance(query, p.name, p.username, p.headline, p._roleText, p._skillText.join(' ')) * 1000 + (p.trust ?? 0) + p.completeness / 10,
    }))
    .filter(x => x.score >= (query.trim() ? 1000 : 0)).sort(byScoreThenRecency).map(x => x.p);
}

async function matchCourses(scope: LocationScope, query: string, f: LocationFilters): Promise<string[]> {
  const city = scope.city.replace(/[%_,()"]/g, '').trim();
  if (!city) return [];
  // Only courses that name this place in their location -- online courses are not included.
  const { data, error } = await supabase.from('courses')
    .select('id, title, short_description, category, location_relevance, is_free, price, level, created_at')
    .eq('status', 'published').ilike('location_relevance', `%${city}%`).limit(CANDIDATE_CAP);
  if (error) throw error;
  const re = cityMatcher(city);
  return (data ?? [])
    .filter((r: any) => re.test(String(r.location_relevance ?? '')))
    .filter((r: any) => !f.price || (f.price === 'free' ? r.is_free || Number(r.price) === 0 : !(r.is_free || Number(r.price) === 0)))
    .filter((r: any) => !f.level || r.level === f.level)
    .map((r: any) => ({ id: String(r.id), score: relevance(query, r.title, r.short_description, r.category), at: timeOf(r.created_at) }))
    .filter(x => x.score > 0).sort(byScoreThenRecency).map(x => x.id);
}

const matchers = {
  marketplace: matchMarketplace, posts: matchPosts, portfolio: matchPortfolio, profiles: matchProfiles, courses: matchCourses,
} as const;

// Cache so switching tabs / "View all" / coming back never refetches what was just loaded.
const cache = new Map<string, { at: number; data: Promise<any[]> }>();
const TTL = 60_000;

export function searchLocationCategory<C extends SectionCategory>(
  slug: string, scope: LocationScope, category: C, query: string, filters: LocationFilters, force = false,
): Promise<CategoryMatches[C]> {
  const key = `${slug.toLowerCase()}|${category}|${query.trim().toLowerCase()}|${JSON.stringify(filters)}`;
  const hit = cache.get(key);
  if (!force && hit && Date.now() - hit.at < TTL) return hit.data as Promise<CategoryMatches[C]>;
  const p = (matchers[category] as any)(scope, query, filters) as Promise<any[]>;
  cache.set(key, { at: Date.now(), data: p });
  p.catch(() => cache.delete(key)); // failures are never cached
  return p as Promise<CategoryMatches[C]>;
}
export const clearLocationSearchCache = () => cache.clear();

// ── Hydration of the visible slice ──────────────────────────────────────────
export async function hydratePosts(ids: string[]): Promise<Post[]> {
  if (!ids.length) return [];
  const posts = await postsApi.getByIds(ids);
  const byId = new Map(posts.map(p => [p.id, p]));
  return ids.map(id => byId.get(id)).filter((p): p is Post => !!p);
}
export async function hydratePortfolio(refs: PortfolioRef[], viewerId?: string): Promise<PortfolioFeedEntry[]> {
  if (!refs.length) return [];
  const byId = await getPortfolioEntriesByIds(
    refs.filter(r => r.type === 'item').map(r => r.id), refs.filter(r => r.type === 'album').map(r => r.id), viewerId);
  return refs.map(r => byId.get(r.id)).filter((e): e is PortfolioFeedEntry => !!e);
}
export async function hydrateCourses(ids: string[]): Promise<Course[]> {
  if (!ids.length) return [];
  const courses = await getCoursesByIds(ids);
  const byId = new Map(courses.map(c => [c.id, c]));
  return ids.map(id => byId.get(id)).filter((c): c is Course => !!c);
}
