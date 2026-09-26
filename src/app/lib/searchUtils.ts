/**
 * Filmons — Universal Search Utilities
 * Alias expansion, accent-insensitive matching, location detection,
 * Supabase OR filter building, and client-side ranking.
 * Apply to: SearchOverlay, Marketplace, MyListings, SavedListings.
 */
import type { Listing } from '../types';

// ── Text normalization ────────────────────────────────────────────────────────
/** Lowercase + strip accents (é→e, ü→u, etc.) for accent-insensitive compare. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['']/g, "'");
}

// ── Known Canadian cities (for location detection) ────────────────────────────
export const KNOWN_CITIES: string[] = [
  'Vancouver', 'Surrey', 'Burnaby', 'Richmond', 'White Rock',
  'Kelowna', 'Victoria', 'Nanaimo', 'Abbotsford', 'Langley',
  'Coquitlam', 'Delta', 'Maple Ridge', 'Prince George', 'Kamloops',
  'Toronto', 'Mississauga', 'Brampton', 'Ottawa', 'Hamilton',
  'London', 'Markham', 'Vaughan', 'Kitchener', 'Windsor', 'Kingston',
  'Montreal', 'Laval', 'Quebec City', 'Longueuil', 'Sherbrooke',
  'Calgary', 'Edmonton', 'Red Deer', 'Lethbridge',
  'Winnipeg', 'Halifax', 'Saskatoon', 'Regina', 'Fredericton',
];

const PROVINCE_MAP: Record<string, string[]> = {
  'BC': ['bc', 'british columbia'],
  'ON': ['on', 'ontario'],
  'QC': ['qc', 'quebec'],
  'AB': ['ab', 'alberta'],
  'MB': ['mb', 'manitoba'],
  'SK': ['sk', 'saskatchewan'],
  'NS': ['ns', 'nova scotia'],
  'NB': ['nb', 'new brunswick'],
  'NL': ['nl', 'newfoundland'],
};

/** Detects city/province/near-me signals from a raw query string. */
export function extractLocation(rawQ: string): { city?: string; province?: string; nearMe?: boolean } {
  const q = normalize(rawQ);
  const words = q.split(/\s+/);

  const nearMe = q.includes('near me') || q.includes('nearby') || q.includes('close by');

  let city: string | undefined;
  for (const c of KNOWN_CITIES) {
    if (q.includes(normalize(c))) { city = c; break; }
  }

  let province: string | undefined;
  for (const [abbr, variants] of Object.entries(PROVINCE_MAP)) {
    if (variants.some(v => words.includes(v))) { province = abbr; break; }
  }

  return { city, province, nearMe: nearMe || undefined };
}

// ── Marketplace intent detection ─────────────────────────────────────────────
// Rental/Sale/Service/Opportunity words behave as search INTENT, not
// ordinary keywords -- "camera rental" means "Rental listings about
// cameras", not "listings whose title/description literally contains the
// word rental". Tokenized (never substring-matched, so "workshop"/
// "artwork"/"workflow"/"workstation"/"network"/"serviceable" never false-
// positive on containing "work"/"service") and checked at ANY token
// position, not just the first word.
export type MarketplaceIntentType = 'rental' | 'sale' | 'service' | 'opportunity';

// Multi-word phrases matched as whole phrases (so "for sale"/"hire
// someone"/"second hand"/"professional service" consume their full
// phrase, never just a fragment); single words matched as whole tokens.
// "hire" is deliberately NOT listed under any type here -- it's ambiguous
// on its own ("hire camera" vs "hire a photographer" vs "hiring a
// photographer" all mean different things) and gets special-cased below.
const MARKETPLACE_INTENT_PHRASES: Record<MarketplaceIntentType, string[]> = {
  rental:      ['rental', 'rentals', 'rent', 'renting'],
  sale:        ['sale', 'sales', 'for sale', 'buy', 'buying', 'purchase', 'used', 'second hand'],
  service:     ['service', 'services', 'freelancer', 'freelancers', 'professional service', 'hire someone'],
  opportunity: ['opportunity', 'opportunities', 'job', 'jobs', 'work', 'works'],
};

// Equipment/gear nouns -- used only to disambiguate a bare "hire" (see
// detectMarketplaceIntent below): "hire camera" means Rental (the OBJECT
// of "hire" is equipment), "hire a photographer" means Service (the
// object is a person/role).
const EQUIPMENT_TERMS = new Set([
  'camera', 'cameras', 'lens', 'lenses', 'gimbal', 'stabilizer', 'tripod',
  'light', 'lights', 'lighting', 'led', 'drone', 'drones', 'mic', 'microphone',
  'audio', 'recorder', 'monitor', 'grip', 'slider', 'dolly', 'jib', 'crane',
  'softbox', 'strobe', 'flash', 'reflector', 'cstand', 'gear', 'equipment', 'kit', 'rig',
]);

const MARKETPLACE_STOP_WORDS = new Set(['a', 'an', 'the']);

/**
 * "camera rental"        -> { intents: ['rental'], remainder: "camera" }
 * "Sony FX3 for sale"    -> { intents: ['sale'], remainder: "sony fx3" }
 * "editing services"     -> { intents: ['service'], remainder: "editing" }
 * "cinematographer jobs" -> { intents: ['opportunity'], remainder: "cinematographer" }
 * "hire camera"          -> { intents: ['rental'], remainder: "camera" }
 * "hire a photographer"  -> { intents: ['service'], remainder: "photographer" }
 * "hiring a photographer"-> { intents: ['opportunity'], remainder: "photographer" }
 * "rental or sale camera"-> { intents: ['rental','sale'], remainder: "camera" }
 * "workshop"              -> { intents: [], remainder: "workshop" }
 * Every matching phrase/token is stripped from the remainder, and more
 * than one intent can be detected at once (e.g. "rental or sale camera").
 */
export function detectMarketplaceIntent(rawQ: string): { intents: MarketplaceIntentType[]; remainder: string } {
  let text = ` ${normalize(rawQ).trim()} `;
  if (text.trim().length === 0) return { intents: [], remainder: rawQ.trim() };

  const found = new Set<MarketplaceIntentType>();

  // Multi-word phrases first, so they consume their full phrase before
  // single-word matching below could otherwise pick off a component word
  // out of context (e.g. "for" alone means nothing, but must not leave a
  // dangling "for" in the remainder once "for sale" is removed).
  for (const type of Object.keys(MARKETPLACE_INTENT_PHRASES) as MarketplaceIntentType[]) {
    for (const phrase of MARKETPLACE_INTENT_PHRASES[type].filter(p => p.includes(' '))) {
      const needle = ` ${phrase} `;
      if (text.includes(needle)) { found.add(type); text = text.split(needle).join(' '); }
    }
  }

  const singleWordMap = new Map<string, MarketplaceIntentType>();
  for (const type of Object.keys(MARKETPLACE_INTENT_PHRASES) as MarketplaceIntentType[]) {
    for (const phrase of MARKETPLACE_INTENT_PHRASES[type].filter(p => !p.includes(' '))) singleWordMap.set(phrase, type);
  }

  const kept: string[] = [];
  let pendingHire: 'hire' | 'hiring' | null = null;
  for (const w of text.trim().split(/\s+/).filter(Boolean)) {
    if (w === 'hire' || w === 'hiring') { pendingHire = w; continue; }
    const mapped = singleWordMap.get(w);
    if (mapped) { found.add(mapped); continue; }
    kept.push(w);
  }

  if (pendingHire === 'hiring') {
    found.add('opportunity');
  } else if (pendingHire === 'hire') {
    found.add(kept.some(w => EQUIPMENT_TERMS.has(w)) ? 'rental' : 'service');
  }

  const remainder = kept.filter(w => !MARKETPLACE_STOP_WORDS.has(w)).join(' ');
  return { intents: Array.from(found), remainder };
}

/** Back-compat single-intent view for callers that only care about
 * Opportunity specifically. */
export function detectOpportunityIntent(rawQ: string): { isOpportunity: boolean; remainder: string } {
  const { intents, remainder } = detectMarketplaceIntent(rawQ);
  return { isOpportunity: intents.includes('opportunity'), remainder };
}

// ── Alias groups ──────────────────────────────────────────────────────────────
// Any term in a group matches all others in that group bidirectionally.
// `kind` classifies the group for recognizeQuery's source-priority decision
// below -- 'gear' (equipment/brand/model -> Marketplace-leaning), 'role'
// (a person's profession/skill -> Connect-leaning), 'context' (everything
// else: venues, event types, genres -- doesn't push priority either way).
// This is purely a recognition-layer addition; expandQuery's own retrieval
// behavior (every term in a matched group still expands the search) is
// unchanged -- it just reads `.terms` now instead of the group directly.
type AliasGroupKind = 'gear' | 'role' | 'context';
interface AliasGroup { kind: AliasGroupKind; terms: string[]; }
const ALIAS_GROUPS: AliasGroup[] = [
  // DJI & Drones
  { kind: 'gear', terms: [
    'dji', 'drone', 'drones', 'fpv', 'mavic', 'phantom', 'inspire',
    'aerial', 'aerials', 'air2s', 'mini3', 'rs4', 'rs3',
    'drone pilot', 'drone operator', 'drone service', 'aerial filming',
    'aerial photography', 'aerial video',
  ] },
  // Cameras — general
  { kind: 'gear', terms: ['camera', 'cam', 'dslr', 'mirrorless', 'cinemagear', 'digicam'] },
  // Sony
  { kind: 'gear', terms: ['sony', 'fx3', 'fx6', 'fx9', 'a7siii', 'a7s', 'a7iii', 'a7', 'a1', 'a6400', 'a6600', 'zv'] },
  // Canon
  { kind: 'gear', terms: ['canon', 'eos', 'c70', 'c300', 'c500', 'c70', 'r5', 'r6', '5d', '6d', 'rebel'] },
  // Blackmagic
  { kind: 'gear', terms: ['blackmagic', 'bmpcc', 'ursa', 'braw', 'pocket cinema', 'resolve'] },
  // RED
  { kind: 'gear', terms: ['red', 'komodo', 'monstro', 'helium', 'raven', 'v-raptor', 'gemini'] },
  // Fujifilm
  { kind: 'gear', terms: ['fuji', 'fujifilm', 'xt4', 'xt5', 'gfx', 'xh2'] },
  // Arri
  { kind: 'gear', terms: ['arri', 'alexa', 'amira', 'mini lf', 'alexa mini'] },
  // Gimbal / Stabilizer
  { kind: 'gear', terms: ['gimbal', 'stabilizer', 'ronin', 'zhiyun', 'crane', 'weebill', 'smooth', 'handheld rig'] },
  // Lenses
  { kind: 'gear', terms: ['lens', 'lenses', 'prime', 'anamorphic', 'sigma', 'zeiss', 'rokinon', 'samyang', 'voigtlander', 'cooke'] },
  // Grip / Support
  { kind: 'gear', terms: ['grip', 'tripod', 'monopod', 'cstand', 'slider', 'jib', 'dolly', 'track', 'rig', 'follow focus'] },
  // Lighting
  { kind: 'gear', terms: [
    'light', 'lighting', 'led', 'aputure', 'godox', 'nanlite', 'nanlux',
    'strobe', 'flash', 'softbox', 'reflector', 'tungsten', 'hmi', 'rgblight',
    'aperture', 'profoto',
  ] },
  // Audio / Sound
  { kind: 'gear', terms: [
    'audio', 'sound', 'mic', 'microphone', 'recorder', 'boom', 'lavalier', 'lav',
    'rode', 'sennheiser', 'shure', 'zoom', 'tascam', 'xlr', 'podcast',
    'voiceover', 'shotgun', 'wireless mic', 'audio engineer', 'sound design',
  ] },
  // Music Production
  { kind: 'role', terms: [
    'music', 'producer', 'beat', 'beats', 'mixing', 'mastering', 'daw',
    'ableton', 'logic', 'flstudio', 'protools', 'musician', 'composer',
    'soundtrack', 'score', 'session musician',
  ] },
  // Streaming / Broadcast
  { kind: 'context', terms: ['stream', 'streaming', 'broadcast', 'live', 'elgato', 'capturecard', 'obs', 'twitch', 'youtube live'] },
  // Videography / Film
  { kind: 'role', terms: [
    'video', 'videographer', 'videography', 'filming', 'film', 'filmmaker',
    'cinematographer', 'cinematography', 'dp', 'dop', 'director of photography',
    'camera operator', 'camop', 'shoot', 'production',
  ] },
  // Photography
  { kind: 'role', terms: [
    'photo', 'photography', 'photographer', 'photoshoot', 'portrait',
    'headshot', 'boudoir', 'event photography', 'wedding photo', 'product photo',
    'fashion photo', 'real estate photo',
  ] },
  // Editing / Post Production
  { kind: 'role', terms: [
    'editor', 'editing', 'post', 'postproduction', 'colorist', 'colorgrade',
    'colourgrade', 'davinci', 'premiere', 'finalcut', 'avid', 'motiondesign',
    'motiongraphics', 'vfx', 'visualeffects', 'animation', '3d', 'cgi',
  ] },
  // Studio / Space
  { kind: 'context', terms: [
    'studio', 'soundstage', 'greenscreen', 'cycwall', 'shootingspace',
    'photostudio', 'filmstudio', 'productionspace', 'creative space',
  ] },
  // Services / Weddings / Events
  { kind: 'context', terms: [
    'wedding', 'weddings', 'event', 'events', 'corporate', 'commercial',
    'interview', 'documentary', 'musicvideo', 'advert', 'advertisement', 'promo',
  ] },
  // Streaming / Podcast
  { kind: 'context', terms: [
    'podcast', 'podcasting', 'podcaststudio', 'podcastsetup', 'podcastproduction',
    'interview setup', 'talk show',
  ] },
  // Gaming / Esports
  { kind: 'context', terms: ['gaming', 'game', 'gamer', 'esport', 'esports', 'twitch', 'streamer', 'fps', 'speedrun'] },
  // Fashion / Wardrobe / Talent
  { kind: 'role', terms: ['model', 'talent', 'actor', 'actress', 'influencer', 'ugc', 'brand deal', 'content creator'] },
  // Props / Set Design
  { kind: 'context', terms: ['prop', 'props', 'costume', 'wardrobe', 'setdressing', 'setdesign', 'art director'] },
  // Real Estate
  { kind: 'context', terms: ['real estate', 'property', 'realestate', 'matterport', 'virtual tour', 'floor plan'] },
  // Aerial / Location scouting
  { kind: 'context', terms: ['location', 'scout', 'locationscout', 'permit', 'permit scout'] },
];

// ── Core expansion ────────────────────────────────────────────────────────────
function termMatchesAlias(word: string, alias: string): boolean {
  if (word.length < 2) return false;
  // Strip spaces for comparison
  const w = word.replace(/\s+/g, '');
  const a = alias.replace(/\s+/g, '');
  if (a === w) return true;
  if (w.length >= 3 && a.startsWith(w)) return true;
  if (a.length >= 3 && w.startsWith(a)) return true;
  if (w.length >= 3 && a.length >= 3 && (a.includes(w) || w.includes(a))) return true;
  return false;
}

// Single-slot memo -- scoreResult (below) calls expandQuery(rawQuery) fresh
// on EVERY comparison inside a results .sort() in filmSearch.ts, and a
// sort of n results makes O(n log n) comparisons, each calling scoreResult
// twice (once per side). That was re-running this whole 26-group alias
// scan from scratch tens of thousands of times per search for no reason --
// every one of those calls shares the exact same rawQuery for the entire
// sort (a single JS .sort() call is synchronous/atomic, so there's no risk
// of a different in-flight query invalidating this mid-sort). Caching the
// last input/output pair turns all of those into a cache hit after the
// first call.
let lastExpandInput: string | null = null;
let lastExpandResult: string[] = [];

/**
 * Expands a raw query into all alias terms.
 * "dji" → ["dji", "drone", "aerial", "fpv", "mavic", ...]
 * "sony camera" → ["sony", "fx3", "a7siii", ..., "camera", "cam", ...]
 */
export function expandQuery(rawQ: string): string[] {
  if (rawQ === lastExpandInput) return lastExpandResult;

  const q = normalize(rawQ).trim();
  if (!q) return (lastExpandInput = rawQ), (lastExpandResult = []);

  const words = q.split(/\s+/).filter(w => w.length >= 2);
  const expanded = new Set<string>([q, ...words]);
  const matchedWords = new Set<string>();

  for (const group of ALIAS_GROUPS) {
    for (const word of words) {
      if (group.terms.some(alias => termMatchesAlias(word, normalize(alias)))) {
        group.terms.forEach(term => expanded.add(normalize(term)));
        matchedWords.add(word);
        // don't break — a query can match multiple groups (e.g. "sony camera")
      }
    }
  }

  // Typo tolerance: only for words the alias scan above didn't already
  // recognize -- a real hit already means the word was understood
  // correctly, so there's nothing to "correct." ADDS the near-match
  // alongside the original word, never replaces it (spec: search both the
  // original query and the likely corrected form).
  for (const word of words) {
    if (matchedWords.has(word) || word.length < 4) continue;
    const corrected = suggestCorrection(word);
    if (corrected) expanded.add(corrected);
  }

  const result = Array.from(expanded).slice(0, 20);
  lastExpandInput = rawQ;
  lastExpandResult = result;
  return result;
}

// ── Typo tolerance ────────────────────────────────────────────────────────────
// A small, bounded Levenshtein distance -- cheap here because it only ever
// runs against the fixed, in-memory alias vocabulary (a few hundred short
// strings), never against the database, and only for words the alias scan
// above found no match for at all.
function editDistance(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

let typoVocabCache: string[] | null = null;
function typoVocabulary(): string[] {
  if (typoVocabCache) return typoVocabCache;
  const set = new Set<string>();
  for (const group of ALIAS_GROUPS) for (const term of group.terms) if (!term.includes(' ')) set.add(normalize(term));
  return (typoVocabCache = Array.from(set));
}

/** Finds a close vocabulary term for a word with no exact/alias match
 *  (e.g. "cinamatographer" -> "cinematographer", "soni" -> "sony").
 *  Returns null rather than guessing when nothing is close enough --
 *  never silently rewrites the user's query, only suggests an addition. */
export function suggestCorrection(word: string): string | null {
  const w = normalize(word);
  if (w.length < 4) return null;
  const maxDist = w.length <= 6 ? 1 : 2;
  let best: string | null = null, bestDist = maxDist + 1;
  for (const term of typoVocabulary()) {
    if (Math.abs(term.length - w.length) > maxDist) continue;
    const d = editDistance(w, term);
    if (d < bestDist) { bestDist = d; best = term; if (d === 0) break; }
  }
  return bestDist <= maxDist ? best : null;
}

// ── Universal query recognition ──────────────────────────────────────────────
// Generalizes detectMarketplaceIntent (rental/sale/service/opportunity) into
// a broader recognizer covering gear/brand/model (ALIAS_GROUPS 'gear'
// groups), role/skill (ALIAS_GROUPS 'role' groups), hashtags, and location
// (extractLocation) -- then decides which of Marketplace/Connect/Learning is
// most likely relevant FIRST for this query, so result sections can render
// in that order instead of a fixed one. Never narrows retrieval itself
// (every existing search function keeps working exactly as it did); this
// only decides ordering/priority on top of what's already fetched.
export type SearchSource = 'marketplace' | 'connect' | 'learning';

export interface QueryRecognition {
  marketplaceIntents: MarketplaceIntentType[];
  gearMatch: boolean;
  roleMatch: boolean;
  hashtags: string[];
  location: { city?: string; province?: string; nearMe?: boolean };
  /** Leftover text after stripping intent phrases -- same convention
   *  detectMarketplaceIntent's own `remainder` already uses. */
  remainder: string;
  sourcePriority: SearchSource[];
}

const LEARNING_CONTENT_TERMS = new Set(['course', 'courses', 'learning', 'tutorial', 'tutorials', 'class', 'classes', 'lesson', 'lessons']);
const DEFAULT_SOURCE_PRIORITY: SearchSource[] = ['marketplace', 'connect', 'learning'];

export function recognizeQuery(rawQ: string): QueryRecognition {
  const hashtags: string[] = [];
  const withoutHashtags = rawQ.replace(/#(\w+)/g, (_m, tag: string) => { hashtags.push(tag.toLowerCase()); return tag; });

  const { intents: marketplaceIntents, remainder } = detectMarketplaceIntent(withoutHashtags);
  const location = extractLocation(remainder);

  const words = normalize(remainder).split(/\s+/).filter(Boolean);
  let gearMatch = false, roleMatch = false, learningMatch = false;
  for (const group of ALIAS_GROUPS) {
    if (words.some(w => group.terms.some(alias => termMatchesAlias(w, normalize(alias))))) {
      if (group.kind === 'gear') gearMatch = true;
      if (group.kind === 'role') roleMatch = true;
    }
  }
  if (words.some(w => LEARNING_CONTENT_TERMS.has(w))) learningMatch = true;

  // Explicit intent/content-type words always win first; role vs. gear only
  // decides ordering when neither of those fired. Ties keep today's
  // existing fixed order (Marketplace, Connect, Learning).
  let sourcePriority: SearchSource[];
  if (marketplaceIntents.length > 0) sourcePriority = ['marketplace', 'connect', 'learning'];
  else if (learningMatch) sourcePriority = ['learning', 'connect', 'marketplace'];
  else if (roleMatch && !gearMatch) sourcePriority = ['connect', 'marketplace', 'learning'];
  else sourcePriority = DEFAULT_SOURCE_PRIORITY;

  return { marketplaceIntents, gearMatch, roleMatch, hashtags, location, remainder, sourcePriority };
}

// ── Client-side matching ──────────────────────────────────────────────────────
/** Returns true if a listing matches the search query (client-side, full alias expansion). */
export function matchesListing(listing: Listing, rawQ: string): boolean {
  if (!rawQ.trim()) return true;
  const haystack = normalize([
    listing.title,
    listing.description ?? '',
    listing.city ?? '',
    listing.province ?? '',
    listing.listingType,
    listing.serviceCategory ?? '',
    listing.listingMode ?? '',
    ...(listing.tags ?? []),
  ].join(' '));
  return expandQuery(rawQ).some(term => haystack.includes(term));
}

/**
 * Score a result for ranking (higher = more relevant).
 * Pass normalized haystack fields individually for best accuracy.
 */
export function scoreResult(rawQ: string, title: string, secondary = '', tertiary = ''): number {
  const q = normalize(rawQ).trim();
  const t = normalize(title);
  const s = normalize(secondary);
  const r = normalize(tertiary);
  let score = 0;
  if (t === q) score += 100;
  else if (t.startsWith(q)) score += 80;
  else if (t.includes(q)) score += 60;
  if (s.includes(q)) score += 30;
  if (r.includes(q)) score += 15;
  // Alias-term bonus
  for (const term of expandQuery(rawQ).slice(0, 5)) {
    if (t.includes(term)) { score += 10; break; }
  }
  return score;
}

// ── Supabase OR filter builders ───────────────────────────────────────────────
function safe(term: string): string {
  return term.replace(/[%_\\,]/g, '');
}

/**
 * Returns only single-word terms safe for PostgREST OR filter strings.
 * Multi-word phrases with spaces break PostgREST's OR parser.
 * Since every multi-word alias has component words listed separately, this loses no power.
 */
function safeTerms(rawQ: string): string[] {
  return expandQuery(rawQ)
    .filter(t => !t.includes(' '))
    .map(safe)
    .filter(t => t.length >= 2)
    .slice(0, 10);
}

/** Supabase OR filters for searching listings (title + description + city). */
export function buildListingFilters(rawQ: string): string[] {
  const terms = safeTerms(rawQ);
  const filters: string[] = [];
  for (const t of terms) {
    filters.push(`title.ilike.%${t}%`, `description.ilike.%${t}%`, `city.ilike.%${t}%`);
  }
  // Raw words as direct fallback
  for (const w of normalize(rawQ).split(/\s+/).filter(w => w.length >= 2)) {
    const t = safe(w);
    if (t && !terms.includes(t)) filters.push(`title.ilike.%${t}%`, `city.ilike.%${t}%`);
  }
  return filters;
}

/** Supabase OR filters for searching creator profiles. */
export function buildProfileFilters(rawQ: string): string[] {
  const terms = safeTerms(rawQ);
  const filters: string[] = [];
  for (const t of terms) {
    filters.push(
      `name.ilike.%${t}%`,
      `username.ilike.%${t}%`,
      `bio.ilike.%${t}%`,
      `primary_role.ilike.%${t}%`,
      `city.ilike.%${t}%`,
      `location.ilike.%${t}%`,
    );
  }
  for (const w of normalize(rawQ).split(/\s+/).filter(w => w.length >= 2)) {
    const t = safe(w);
    if (t && !terms.includes(t)) filters.push(`name.ilike.%${t}%`, `city.ilike.%${t}%`);
  }
  return filters;
}

/** Supabase OR filters for searching portfolio_items. */
export function buildPortfolioFilters(rawQ: string): string[] {
  const terms = safeTerms(rawQ);
  const filters: string[] = [];
  for (const t of terms) {
    filters.push(`title.ilike.%${t}%`, `description.ilike.%${t}%`, `category.ilike.%${t}%`);
  }
  for (const w of normalize(rawQ).split(/\s+/).filter(w => w.length >= 2)) {
    const t = safe(w);
    if (t && !terms.includes(t)) filters.push(`title.ilike.%${t}%`);
  }
  return filters;
}
