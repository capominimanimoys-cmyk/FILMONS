// Shared profile search / recommendations for the Browse search and Connect
// search profile cards (components/search/ProfileSearch.tsx).
//
// One implementation for both surfaces:
//   * searchProfiles(query)    -- public profiles matching name, username, role,
//                                 business industry, skills, tools and location,
//                                 ordered by relevance; trust score and profile
//                                 completeness only break ties between similarly
//                                 relevant matches.
//   * getCreatorsForYou(user)  -- recommendations from the viewer's primary role,
//                                 skills, tools and location; a guest gets plain
//                                 public recommendations (verified / trusted /
//                                 complete profiles first), nothing personalised.
// Only public profile columns are ever selected.
import { supabase } from '../../lib/supabase';
import { expandSearchTerms, detectQueryLocation } from './filmSearch';
import { scoreResult } from './searchUtils';
import { normalizeTier } from './reliabilityApi';

export interface SearchProfile {
  id: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  isVerified: boolean;
  accountType: string | null;
  /** Primary role, or business industry for Business accounts. */
  headline: string | null;
  city: string | null;
  province: string | null;
  /** "Surrey, BC" -- city plus province abbreviation, '' when unknown. */
  place: string;
  /** Skills + tools, de-duplicated, query-matching ones first. */
  chips: string[];
  /** Out of 100, null when the profile has no score yet. */
  trust: number | null;
  /** 0-100 profile completeness (tie-breaker only). */
  completeness: number;
  /** Lower-cased searchable text for client-side filtering. */
  _roleText: string;
  _locationText: string;
  _skillText: string[];
}

export interface ProfileFilters {
  location: string;
  role: string;
  skill: string;
  verifiedOnly: boolean;
}
export const EMPTY_PROFILE_FILTERS: ProfileFilters = { location: '', role: '', skill: '', verifiedOnly: false };
export const hasActiveProfileFilters = (f: ProfileFilters) => !!(f.location.trim() || f.role.trim() || f.skill.trim() || f.verifiedOnly);

export const PROFILE_SELECT = 'id, name, username, avatar_url, city, province, location, primary_role, business_industry, account_type, bio, is_verified, skills, gear, secondary_roles';
const TEXT_LIMIT = 200;
const POOL_LIMIT = 150;

const lc = (s: unknown) => String(s ?? '').trim().toLowerCase();

// Some profiles carry placeholder dashes instead of empty values -- treat as missing.
const PLACEHOLDER = /^[\s\-–—_.?]*$|^n\/?a$|^none$/i;
const real = (v: unknown): string => { const t = String(v ?? '').trim(); return PLACEHOLDER.test(t) ? '' : t; };

const PROVINCES: Record<string, string> = {
  'alberta': 'AB', 'british columbia': 'BC', 'manitoba': 'MB', 'new brunswick': 'NB',
  'newfoundland and labrador': 'NL', 'newfoundland': 'NL', 'nova scotia': 'NS', 'northwest territories': 'NT',
  'nunavut': 'NU', 'ontario': 'ON', 'prince edward island': 'PE', 'quebec': 'QC', 'québec': 'QC',
  'saskatchewan': 'SK', 'yukon': 'YT',
};
/** "Surrey, BC" -- Canadian provinces always as their 2-letter code, one consistent format. */
export function formatPlace(city: unknown, province: unknown, location?: unknown): string {
  let c = real(city), p = real(province);
  if (!c && location) {                      // fall back to "City, Province, Country" free text
    const parts = String(location).split(',').map(x => x.trim()).filter(x => real(x));
    c = parts[0] ?? ''; p = p || (parts[1] ?? '');
  }
  if (!c) return '';
  const code = PROVINCES[p.toLowerCase()] ?? (p.length <= 3 ? p.toUpperCase() : p);
  return code ? `${c}, ${code}` : c;
}
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(x => real(x)).filter(Boolean) : []);
const cleanTerm = (t: string) => t.replace(/[%_\\,()"]/g, '').trim();

function completenessOf(r: any): number {
  let pts = 0;
  if (r.avatar_url) pts += 20;
  if (r.bio && String(r.bio).trim().length > 10) pts += 20;
  if (r.primary_role || r.business_industry) pts += 20;
  if (r.city || r.location) pts += 15;
  if (arr(r.skills).length) pts += 15;
  if (arr(r.gear).length) pts += 10;
  return Math.min(100, pts);
}

export async function fetchTrust(ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!ids.length) return out;
  const { data } = await supabase.from('reputation_scores').select('user_id, filmons_reliability_score').in('user_id', ids);
  for (const r of data ?? []) {
    const v = Number((r as any).filmons_reliability_score);
    if (Number.isFinite(v)) out.set((r as any).user_id, Math.max(0, Math.min(100, Math.round(v))));
  }
  return out;
}

export function toProfile(r: any, trust: Map<string, number>, matchTerms: string[]): SearchProfile {
  const tier = normalizeTier(r.account_type ?? undefined);
  const headline = real(tier === 'business' ? r.business_industry : r.primary_role) || null;
  const skills = arr(r.skills), tools = arr(r.gear);
  const all = [...new Set([...skills, ...tools])];
  // Chips that match what was searched come first.
  const matches = (c: string) => matchTerms.some(t => lc(c).includes(t));
  const chips = [...all.filter(matches), ...all.filter(c => !matches(c))].slice(0, 3);
  const city = r.city || null;
  return {
    id: r.id, name: r.name, username: r.username ?? null, avatarUrl: r.avatar_url ?? null,
    isVerified: !!r.is_verified, accountType: r.account_type ?? null, headline,
    city, province: r.province || null, place: formatPlace(r.city, r.province, r.location), chips,
    trust: trust.get(r.id) ?? null, completeness: completenessOf(r),
    _roleText: lc([r.primary_role, r.business_industry, ...arr(r.secondary_roles)].filter(Boolean).join(' ')),
    _locationText: lc([r.city, r.province, r.location].filter(Boolean).join(' ')),
    _skillText: all.map(lc),
  };
}

/** Tie-breaker among equally relevant profiles: trust first, then completeness. */
const quality = (p: SearchProfile) => (p.trust ?? 0) * 0.6 + p.completeness * 0.4;

// ── Search ───────────────────────────────────────────────────────────────────
async function fetchTextMatches(query: string): Promise<SearchProfile[]> {
  const terms = expandSearchTerms(query).map(cleanTerm).filter(Boolean);
  if (!terms.length) return [];
  const textClauses = terms.flatMap(t => [
    `name.ilike.%${t}%`, `username.ilike.%${t}%`, `primary_role.ilike.%${t}%`, `business_industry.ilike.%${t}%`,
    `city.ilike.%${t}%`, `province.ilike.%${t}%`, `location.ilike.%${t}%`, `bio.ilike.%${t}%`,
  ]);
  // Array columns only match whole elements (PostgREST `cs`); a supplement to the text fields.
  const arrayClauses = terms.flatMap(t => [`skills.cs.{"${t}"}`, `gear.cs.{"${t}"}`, `secondary_roles.cs.{"${t}"}`]);
  const [textRes, arrayRes] = await Promise.all([
    supabase.from('profiles').select(PROFILE_SELECT).or(textClauses.join(',')).not('name', 'is', null).neq('name', '').limit(TEXT_LIMIT),
    supabase.from('profiles').select(PROFILE_SELECT).or(arrayClauses.join(',')).not('name', 'is', null).neq('name', '').limit(TEXT_LIMIT),
  ]);
  if (textRes.error) throw textRes.error; // a failed search must show Retry, never "no creators"
  const seen = new Set<string>();
  const rows: any[] = [];
  for (const r of [...(textRes.data ?? []), ...(arrayRes.data ?? [])]) if (r?.id && !seen.has(r.id)) { seen.add(r.id); rows.push(r); }

  const trust = await fetchTrust(rows.map(r => r.id)).catch(() => new Map<string, number>());
  const q = lc(query);
  const matchTerms = [...new Set([q, ...terms.map(lc)])];
  const scored = rows.map(r => {
    const skills = [...arr(r.skills), ...arr(r.gear)];
    let rel = Math.max(
      scoreResult(query, r.name ?? '', r.username ?? '', ''),
      scoreResult(query, r.username ?? '', '', ''),
    );
    rel = Math.max(rel, 0);
    if (lc(r.primary_role).includes(q) || lc(r.business_industry).includes(q)) rel += 45;
    if (skills.some(s => lc(s).includes(q))) rel += 35;
    if (lc([r.city, r.province, r.location].join(' ')).includes(q)) rel += 25;
    if (lc(r.bio).includes(q)) rel += 8;
    if (!rel) rel = 5; // matched via an alias term only
    return { p: toProfile(r, trust, matchTerms), rel };
  });
  scored.sort((a, b) => {
    const bucket = (x: number) => Math.round(x / 25);   // "similarly relevant" = same bucket
    return bucket(b.rel) - bucket(a.rel) || quality(b.p) - quality(a.p) || b.rel - a.rel;
  });
  return scored.map(s => s.p);
}

// "Surrey videographer": everyone based in Surrey, with those who also match "videographer" first,
// then anyone else the plain text search finds.
async function fetchMatches(query: string): Promise<SearchProfile[]> {
  const loc = await detectQueryLocation(query).catch(() => null);
  if (!loc) return fetchTextMatches(query);
  const city = loc.city.replace(/[%_,()"]/g, '').trim();
  const [placeRes, text] = await Promise.all([
    supabase.from('profiles').select(PROFILE_SELECT).or(`city.ilike."${city}",location.ilike."%${city}%"`)
      .not('name', 'is', null).neq('name', '').limit(TEXT_LIMIT),
    fetchTextMatches(query).catch(() => [] as SearchProfile[]),
  ]);
  if (placeRes.error) { if (text.length) return text; throw placeRes.error; }
  const esc = city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(^|[\\s,])${esc}(?=$|[\\s,])`, 'i');
  const rows = (placeRes.data ?? []).filter((r: any) => lc(r.city).trim() === city.toLowerCase() || re.test(String(r.location ?? '')));
  const trust = await fetchTrust(rows.map((r: any) => r.id)).catch(() => new Map<string, number>());
  const rem = lc(loc.remainder);
  const place = rows.map((r: any) => toProfile(r, trust, rem ? [rem] : []));
  const matchesRest = (p: SearchProfile) => !!rem && (lc(p.name).includes(rem) || p._roleText.includes(rem) || p._skillText.some(x => x.includes(rem)) || lc(p.headline).includes(rem));
  place.sort((a, b) => Number(matchesRest(b)) - Number(matchesRest(a)) || quality(b) - quality(a));
  const seen = new Set<string>();
  return [...place, ...text].filter(p => !seen.has(p.id) && !!seen.add(p.id));
}

// ── Recommendations ──────────────────────────────────────────────────────────
export interface ViewerSignals {
  id?: string;
  primaryRole?: string;
  skills?: string[];
  gear?: string[];
  city?: string;
  province?: string;
}

async function fetchCreatorsForYou(viewer: ViewerSignals | null): Promise<SearchProfile[]> {
  let q = supabase.from('profiles').select(PROFILE_SELECT)
    .not('name', 'is', null).neq('name', '')
    .or('primary_role.not.is.null,business_industry.not.is.null')
    .order('is_verified', { ascending: false }).limit(POOL_LIMIT);
  if (viewer?.id) q = q.neq('id', viewer.id);
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as any[];
  const trust = await fetchTrust(rows.map(r => r.id)).catch(() => new Map<string, number>());

  const myRole = lc(viewer?.primaryRole);
  const mySkills = new Set(arr(viewer?.skills).map(lc));
  const myTools = new Set(arr(viewer?.gear).map(lc));
  const myCity = lc(viewer?.city);
  const myProv = lc(viewer?.province);
  const personalised = !!(viewer?.id && (myRole || mySkills.size || myTools.size || myCity));

  const scored = rows.map(r => {
    const p = toProfile(r, trust, [...mySkills, ...myTools]);
    let rel = 0;
    if (personalised) {
      const roleText = lc([r.primary_role, r.business_industry, ...arr(r.secondary_roles)].join(' '));
      if (myRole && roleText.includes(myRole)) rel += 40;
      rel += 12 * arr(r.skills).filter(s => mySkills.has(lc(s))).length;
      rel += 12 * arr(r.gear).filter(s => myTools.has(lc(s))).length;
      if (myCity && lc(r.city) === myCity) rel += myProv && lc(r.province) === myProv ? 30 : 22;
      else if (myProv && lc(r.province) === myProv) rel += 8;
    }
    return { p, rel };
  });
  scored.sort((a, b) => {
    const bucket = (x: number) => Math.round(x / 20);
    return bucket(b.rel) - bucket(a.rel) || quality(b.p) - quality(a.p) || Number(b.p.isVerified) - Number(a.p.isVerified);
  });
  return scored.map(s => s.p);
}

// ── Cached, de-duplicated loading ────────────────────────────────────────────
const cache = new Map<string, { at: number; data: SearchProfile[] }>();
const inflight = new Map<string, Promise<SearchProfile[]>>();
const TTL = 2 * 60_000;

/** Full ranked list for a query (or the viewer's recommendations when the query is empty). */
export function loadProfiles(query: string, viewer: ViewerSignals | null, force = false): Promise<SearchProfile[]> {
  const q = query.trim();
  const key = q ? `q:${q.toLowerCase()}` : `recs:${viewer?.id ?? 'guest'}`;
  const hit = cache.get(key);
  if (!force && hit && Date.now() - hit.at < TTL) return Promise.resolve(hit.data);
  let p = inflight.get(key);
  if (!p) {
    p = (q ? fetchMatches(q) : fetchCreatorsForYou(viewer))
      .then(data => { cache.set(key, { at: Date.now(), data }); return data; })
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;
}
export function peekProfiles(query: string, viewerId?: string): SearchProfile[] | null {
  const q = query.trim();
  return cache.get(q ? `q:${q.toLowerCase()}` : `recs:${viewerId ?? 'guest'}`)?.data ?? null;
}

export function applyProfileFilters(list: SearchProfile[], f: ProfileFilters): SearchProfile[] {
  const loc = lc(f.location), role = lc(f.role), skill = lc(f.skill);
  return list.filter(p =>
    (!f.verifiedOnly || p.isVerified)
    && (!loc || p._locationText.includes(loc))
    && (!role || p._roleText.includes(role))
    && (!skill || p._skillText.some(s => s.includes(skill))));
}
